const webpack = require('webpack')
const path = require('path')

module.exports = (function(options) {
  return {
    entry: "./demo/index.tsx",

    output: {
      filename: "bundle.js"
    },

    devtool: 'source-map',

    module: {
      rules: [
        { test: /\.tsx$/, loader: "awesome-typescript-loader" },
        { test: /\.css$/, loader: "style-loader!css-loader" }
      ]
    },

    plugins: [ ],

    resolve: {
      extensions: ['.tsx', '.ts', '.js', '.json']
    }

  }
})();
