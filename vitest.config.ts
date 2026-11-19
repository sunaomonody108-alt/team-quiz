import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // Emulator を共有するので、ファイル単位でも順番に実行する
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 20000,
  },
})
