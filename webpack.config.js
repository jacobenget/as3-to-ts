const webpack = require('webpack')
const path = require('path')
const fs = require('fs-extra')

function readdir(dir, prefix, result) {
  if (!prefix) prefix = '';
  if (!result) result = [];

    fs.readdirSync(dir).forEach(file => {
        let fileName = path.join(prefix, file);
        let filePath = path.join(dir, file);
        if (!fs.statSync(filePath).isDirectory()) {
            result.push(fileName);
        } else {
            readdir(filePath, fileName, result);
        }
    });
    return result;
}

const FILES = readdir(path.join(__dirname, "test/as3")).filter((file) => {
  return file.match(/\.as$/)
});

module.exports = (function(options) {
  return {
    entry: "./demo/index.tsx",

    output: {
      filename: "bundle.js"
    },

    devtool: 'source-map',

    module: {
      rules: [
        { test: /\.tsx?$/, loader: "awesome-typescript-loader" },
        { test: /\.css$/, loader: "style-loader!css-loader" }
      ]
    },

    plugins: [
      new webpack.DefinePlugin({
        FILES: JSON.stringify( FILES )
      })
    ],

    resolve: {
      extensions: ['.tsx', '.ts', '.js', '.json']
    }

  }
})();
