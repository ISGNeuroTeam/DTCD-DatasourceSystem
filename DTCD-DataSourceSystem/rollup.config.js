import { nodeResolve } from '@rollup/plugin-node-resolve';
import { babel } from '@rollup/plugin-babel';
import json from '@rollup/plugin-json';

import { version } from './package.json';

import pluginMeta from './src/Plugin.Meta';

const watch = Boolean(process.env.ROLLUP_WATCH);

const outputDirectory = watch
  ? `./../../DTCD/server/plugins/DTCD-${pluginMeta.name}_${version}`
  : `./build`;
const outputFile = `${pluginMeta.name}.js`;

const plugins = [
  nodeResolve(),
  json(),
  babel({
    babelHelpers: 'bundled',
  }),
];

export default {
  plugins,
  input: `./src/DataSourceSystem.js`,
  output: {
    file: `${outputDirectory}/${outputFile}`,
    format: 'esm',
    sourcemap: true,
  },
  watch: {
    include: ['./*/**'],
  },
};
