// Automated repro/regression for the editor's undo/redo (SPEC A2).
//
// The owner reported the toolbar undo/redo "does nothing". The production code
// (CollabEditor.doUndo/doRedo) drives the Yjs UndoManager straight through
// y-prosemirror's `undo(state)` / `redo(state)` and reads button-enabled state
// from `yUndoPluginKey.getState(state).undoManager.{undo,redo}Stack.length`.
//
// This test mounts the *same* extension stack the component uses (StarterKit with
// history disabled + Collaboration bound to a local Y.Doc) and exercises that exact
// code path headlessly — no WebSocket/auth needed, since undo/redo operate purely on
// the local Y.Doc. If undo/redo were broken at the library-wiring level, this fails.
import { describe, it, expect, afterEach } from 'vitest'
import { Editor, type Extensions } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Collaboration from '@tiptap/extension-collaboration'
import CollaborationCursor from '@tiptap/extension-collaboration-cursor'
import { yUndoPluginKey, undo as yUndo, redo as yRedo } from 'y-prosemirror'
import { Awareness } from 'y-protocols/awareness'
import * as Y from 'yjs'

// Mirror the production extension stack. `withCursor` adds CollaborationCursor bound to
// a bare Awareness (no WebSocket) — the ADR flagged awareness transactions as what made
// the *old* can().undo() read unreliable, so we assert the current approach survives it.
function mountEditor(withCursor = true) {
  const ydoc = new Y.Doc()
  const element = document.createElement('div')
  document.body.appendChild(element)
  const awareness = new Awareness(ydoc)
  const extensions: Extensions = [StarterKit.configure({ history: false }), Collaboration.configure({ document: ydoc })]
  if (withCursor) {
    extensions.push(
      CollaborationCursor.configure({ provider: { awareness } as never, user: { name: 'Tester', color: '#7c5cff' } }),
    )
  }
  const editor = new Editor({ element, extensions })
  return { editor, ydoc, element, awareness }
}

let current: { editor: Editor; ydoc: Y.Doc; element: HTMLElement; awareness: Awareness } | null = null
afterEach(() => {
  current?.editor.destroy()
  current?.ydoc.destroy()
  current?.element.remove()
  current = null
})

const stacks = (editor: Editor) => {
  const um = yUndoPluginKey.getState(editor.state)?.undoManager
  return { um, canUndo: (um?.undoStack.length ?? 0) > 0, canRedo: (um?.redoStack.length ?? 0) > 0 }
}

describe('editor undo/redo wiring (SPEC A2)', () => {
  it('exposes a live UndoManager through yUndoPluginKey', () => {
    current = mountEditor()
    // If this is undefined the toolbar buttons are permanently disabled — the exact
    // "nothing happens" symptom. Guards against a duplicate-y-prosemirror regression.
    expect(yUndoPluginKey.getState(current.editor.state)?.undoManager).toBeDefined()
  })

  it('undo reverts the last edit and redo re-applies it', () => {
    current = mountEditor()
    const { editor } = current

    editor.commands.insertContent('Hello world')
    expect(editor.getText()).toContain('Hello world')
    expect(stacks(editor).canUndo).toBe(true)
    expect(stacks(editor).canRedo).toBe(false)

    // Exact production call path (CollabEditor.doUndo).
    yUndo(editor.state)
    expect(editor.getText()).not.toContain('Hello world')
    expect(stacks(editor).canUndo).toBe(false)
    expect(stacks(editor).canRedo).toBe(true)

    // Exact production call path (CollabEditor.doRedo).
    yRedo(editor.state)
    expect(editor.getText()).toContain('Hello world')
    expect(stacks(editor).canUndo).toBe(true)
    expect(stacks(editor).canRedo).toBe(false)
  })

  it('a fresh edit after undo clears the redo stack', () => {
    current = mountEditor()
    const { editor } = current
    editor.commands.insertContent('first')
    yUndo(editor.state)
    expect(stacks(editor).canRedo).toBe(true)
    editor.commands.insertContent('second')
    expect(stacks(editor).canRedo).toBe(false)
  })
})
