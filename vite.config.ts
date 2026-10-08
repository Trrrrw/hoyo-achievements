import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: {
        strictExecutionOrder: true,
        codeSplitting: {
          includeDependenciesRecursively: false,
          groups: [
            {
              name: "react",
              test: /[\\/]node_modules[\\/](?:react(?:-dom)?|scheduler)[\\/]/,
            },
          ],
        },
      },
    },
  },
  server: {
    proxy: {
      "/api": {
        target: process.env.AKASHA_DEV_PROXY || "http://127.0.0.1:7040",
        changeOrigin: true,
      },
    },
  },
});
