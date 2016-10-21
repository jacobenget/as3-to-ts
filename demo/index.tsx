import "codemirror/mode/javascript/javascript";
import "codemirror/lib/codemirror.css";
import "codemirror/theme/monokai.css";

declare const FILES: string[];

import * as React from "react";
import * as ReactDOM from "react-dom";
import * as CodeMirror from "react-codemirror";

import { emit, EmitterOptions } from "../src/emit/emitter";
import parse from "../src/parse";

interface IAppData {
  code: string;
  useNamespaces: boolean;
}

class App extends React.Component<{}, IAppData> {
  emitterOptions: EmitterOptions;

  constructor () {
    super();

    this.state = {
      code: "// Code",
      // result: "",
      useNamespaces: false
    };

    this.emitterOptions = {
        lineSeparator: '\n',
        useNamespaces: this.state.useNamespaces,
        bridge: undefined,
        definitionsByNamespace: {}
    };
  }

  onChangeFile = (event: Event): void => {
    console.log("changed!")
    let xhr = new XMLHttpRequest();
    xhr.onreadystatechange = function() {
      if (xhr.readyState === 4) {
        if (xhr.status === 200) {
          // this.state.result
          this.code = emit(parse(xhr.response), xhr.response, this.emitterOptions);
        }
      }
    }
    xhr.open("GET", `test/as3/${ event.target.value }`, true);
    xhr.send();
  }

  onChangeBridge = (event: Event): void => {
    // this.state.bridge
  }

  onChangeNamespaces = (event: Event): void => {
    this.state.useNamespaces = event.target.value;
  }

  updateCode (newCode: string) {
    this.setState({ code: newCode });
  }

  render () {
    var options = {
      lineNumbers: true
    };

    return <div>
      <header>
        <select onChange={ this.onChangeFile }>
        { FILES.map((file) => {
          return <option value={file}>{ file }</option>
        }) }
        </select>

        <input type="checkbox" id="createjs" onChange={ this.onChangeBridge } />
        <label htmlFor="createjs">Use CreateJS</label>

        <input type="checkbox" id="namespaces" onChange={ this.onChangeNamespaces } />
        <label htmlFor="namespaces">Use namespaces</label>
      </header>
      <CodeMirror value={this.state.code} onChange={this.updateCode} options={options} />
    </div>
  }

}

ReactDOM.render(<App />, document.getElementById('app'));
