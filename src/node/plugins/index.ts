import { createRequire } from "module";
import path from "upath";
import {
  mergeConfig,
  Plugin,
  PluginOption,
  UserConfig as ViteConfig,
  searchForWorkspaceRoot,
} from "vite";
import react from "@vitejs/plugin-react";
import icons from "unplugin-icons/vite";
import { conventionalEntries as entries } from "vite-plugin-conventional-entries";
import { conventionalRoutes as routes } from "vite-plugin-conventional-routes";
import {
  DEFAULT_THEME_FILE,
  DIST_APP_DIR,
  DIST_CLIENT_DIR,
  DIST_THEME_DIR,
  THEME_MODULE_ID,
} from "../common/constants.js";
import { createResolveExports, getGitRoot } from "../common/utils.js";
import { SiteConfig } from "../common/types.js";
import { createMdxPlugin } from "./mdx/index.js";
import { createThemePlugin } from "./theme.js";

const require = createRequire(import.meta.url);
const resolveExports = createResolveExports(require);

function resolveFsAllow(siteConfig: SiteConfig) {
  const workspaceRoot = searchForWorkspaceRoot(siteConfig.root);

  const allowDirs = [DIST_CLIENT_DIR, DIST_THEME_DIR, workspaceRoot];

  Object.values(siteConfig.pages).forEach(({ dir }) => {
    if (!dir.startsWith(workspaceRoot)) {
      allowDirs.push(dir);
    }
  });

  return allowDirs;
}

export function createVpressifyPlugin(
  siteConfig: SiteConfig,
  ssr: boolean
): (PluginOption | PluginOption[])[] {
  const mainPlugin: Plugin = {
    name: "vpressify:main",

    config: () => {
      const userPostcssConfig = siteConfig.vite?.css?.postcss;

      const viteConfig: ViteConfig = {
        resolve: {
          alias: [
            {
              find: /^vpressify\/client$/,
              replacement: path.join(DIST_CLIENT_DIR, "index"),
            },
            {
              find: /^vpressify\/theme$/,
              replacement: DEFAULT_THEME_FILE,
            },
            // make sure it always use the same react dependency that comes with vpressify itself
            {
              find: /^react$/,
              replacement: resolveExports("react"),
            },
            {
              find: /^react\/jsx-dev-runtime$/,
              replacement: resolveExports("react/jsx-dev-runtime"),
            },
            {
              find: /^react\/jsx-runtime$/,
              replacement: resolveExports("react/jsx-runtime"),
            },
            {
              find: /^react-dom$/,
              replacement: resolveExports("react-dom"),
            },
            {
              find: /^react-dom\/client$/,
              replacement: resolveExports("react-dom/client"),
            },
            {
              find: /^react-dom\/server$/,
              replacement: resolveExports("react-dom/server"),
            },
            {
              find: /^react-router-dom$/,
              replacement: resolveExports("react-router-dom/index"),
            },
            {
              find: /^react-helmet-async$/,
              replacement: resolveExports("react-helmet-async"),
            },
            {
              find: /^react-transition-group$/,
              replacement: resolveExports("react-transition-group"),
            },
            {
              find: /^@mdx-js\/react$/,
              replacement: resolveExports("@mdx-js/react"),
            },
            {
              find: /^valtio$/,
              replacement: resolveExports("valtio"),
            },
            {
              find: /^nprogress$/,
              replacement: resolveExports("nprogress"),
            },
            {
              find: /^@docsearch\/css$/,
              replacement: resolveExports("@docsearch/css"),
            },
            {
              find: /^@docsearch\/react$/,
              replacement: resolveExports("@docsearch/react"),
            },
            {
              find: /^@docsearch\/react\/modal$/,
              replacement: resolveExports("@docsearch/react/modal"),
            },
            {
              find: /^lodash-es$/,
              replacement: resolveExports("lodash-es"),
            },
            {
              find: THEME_MODULE_ID,
              replacement: siteConfig.themePath,
            },
          ],
        },
        define: {
          __HASH_ROUTER__: Boolean(siteConfig.useHashRouter),
        },
        optimizeDeps: {
          // entries: [CSR_ENTRY_FILE, DEFAULT_THEME_FILE],
          include: [
            // client deps
            "react",
            "react/jsx-runtime",
            "react/jsx-dev-runtime",
            "react-dom",
            "react-dom/client",
            "react-router-dom",
            "react-helmet-async",
            "react-transition-group",
            "valtio",
            "@mdx-js/react",
            "nprogress",
            // default theme deps
            // "@docsearch/css",
            "@docsearch/react",
            "@docsearch/react/modal",
            "lodash-es",
          ],
          exclude: ["vpressify"],
        },
        server: {
          fs: {
            allow: resolveFsAllow(siteConfig),
          },
        },
        css: {
          postcss:
            typeof userPostcssConfig === "string"
              ? userPostcssConfig
              : {
                  ...userPostcssConfig,
                  plugins: [
                    require("postcss-import"),
                    require("tailwindcss/nesting")("postcss-nesting"),
                    require("tailwindcss")(siteConfig.tailwind),
                    require("postcss-preset-env")({
                      stage: 2,
                      features: {
                        "nesting-rules": false,
                      },
                      autoprefixer: {
                        flexbox: "no-2009",
                      },
                    }),
                  ].concat(userPostcssConfig?.plugins || []),
                },
        },
      };

      return siteConfig.vite
        ? mergeConfig(siteConfig.vite, viteConfig)
        : viteConfig;
    },

    configureServer(server) {
      if (siteConfig.configPath) {
        server.watcher.add(siteConfig.configPath);
      }
    },

    generateBundle(_, bundle) {
      // ssr build. delete all asset chunks
      if (ssr) {
        for (const name in bundle) {
          if (bundle[name].type === "asset") {
            delete bundle[name];
          }
        }
      }
    },
  };

  // Injecting other plugins inside the config hook will have no effect,
  // so we inject the user plugins here.
  // (we need to flatten them)
  const userVitePlugins = siteConfig.vite?.plugins?.flatMap((item) => item);

  return [
    userVitePlugins,
    react(siteConfig.react),
    icons(siteConfig.icons),
    entries({ entries: DIST_APP_DIR }),
    routes({
      pages: siteConfig.pages,
      ignore: siteConfig.ignore,
      onCreatePageData(pageData) {
        // get relative path from git root. It will be used to create git edit link
        // e.g. https://github.com/v-poc/vpressify/edit/master/package.json
        const gitRoot = getGitRoot(pageData.filePath);
        const filePathFromGitRoot = gitRoot
          ? path.relative(gitRoot, pageData.filePath)
          : pageData.filePath;

        return {
          ...pageData,
          filePath: filePathFromGitRoot,
        };
      },
    }),
    // internal plugins
    mainPlugin,
    createMdxPlugin(siteConfig.mdx),
    createThemePlugin(siteConfig),
  ];
}
