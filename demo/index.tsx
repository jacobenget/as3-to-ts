import "codemirror/mode/javascript/javascript";
import "codemirror/lib/codemirror.css";
import "codemirror/theme/monokai.css";
import "./index.css";

declare const FILES: string[];

import * as React from "react";
import * as ReactDOM from "react-dom";
import * as CodeMirror from "react-codemirror";

import { emit, EmitterOptions } from "../src/emit/emitter";
import * as parse from "../src/parse";
import bridge from "../src/bridge/createjs";

interface IAppData {
  source: string;
  output: string;
  useNamespaces: boolean;
}

class App extends React.Component<{}, IAppData> {
  emitterOptions: EmitterOptions;

  constructor () {
    super();

    this.state = {
      source: "// Paste AS3 code on the left",
      output: "// Paste AS3 code on the left",
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
    let xhr = new XMLHttpRequest();
    let file = event.target.value;

    xhr.onreadystatechange = () => {
      if (xhr.readyState === 4) {
        if (xhr.status === 200) {
          this.updateSource(xhr.response, file);
        }
      }
    }

    xhr.open("GET", `test/as3/${ file }`, true);
    xhr.send();
  }

  onChangeBridge = (event: Event): void => {
    this.emitterOptions.bridge = (event.target.checked) ? bridge : undefined;
    this.updateSource(this.state.source, this.state.file);
  }

  // onChangeNamespaces = (event: Event): void => {
  //   this.setState({
  //     useNamespaces: event.target.checked
  //   });
  //   this.emitterOptions.useNamespaces = event.target.checked
  //   this.updateSource(this.state.source, this.state.file);
  // }

  updateSource = (source: string, file?: string = this.state.file): void => {
    let output = emit(parse("", source), source, this.emitterOptions);

    if (this.state.bridge && bridge.postProcessing) {
      output = bridge.postProcessing(this.emitterOptions, output);
    }

    this.setState({
      file: file,
      source: source,
      output: output
    });

    (this.refs as any).editorSource.getCodeMirror().setValue(source);
    (this.refs as any).editorOutput.getCodeMirror().setValue(output);
  }

  render () {
    var options = {
      lineNumbers: true,
      viewportMargin: Infinity
    };

    return <div>
      <header>
        <select onChange={ this.onChangeFile }>
          return <option>select example</option>
        { FILES.map((file) => {
          return <option value={file}>{ file }</option>
        }) }
        </select>

        <input type="checkbox" id="createjs" onChange={ this.onChangeBridge } />
        <label htmlFor="createjs">createjs bridge</label>

        {/*<input type="checkbox" id="namespaces" checked={this.state.useNamespaces} defaultChecked={this.state.useNamespaces} onChange={ this.onChangeNamespaces } />*/}
        {/*<label htmlFor="namespaces">Use namespaces</label>*/}
      </header>

      <CodeMirror className="left" ref="editorSource" value={this.state.source} onChange={this.updateSource} options={options} />
      <CodeMirror className="right" ref="editorOutput" value={this.state.output} options={options} />
    </div>
  }

}

ReactDOM.render(<App />, document.getElementById('app'));
