// Registers jest-dom matchers (toBeInTheDocument, toBeDisabled, ...) on Vitest's
// expect, and auto-cleans the DOM between tests to prevent cross-test leakage.
import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => cleanup())
