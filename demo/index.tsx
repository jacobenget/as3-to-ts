import "codemirror/mode/javascript/javascript";
import "codemirror/lib/codemirror.css";
import "codemirror/theme/monokai.css";

import * as React from "react";
import * as ReactDOM from "react-dom";
import * as CodeMirror from "react-codemirror";

interface IAppData {
  code: string;
}

class App extends React.Component<{}, IAppData> {

  constructor () {
    super();
    this.state = { code: "// Code" }
  }

  updateCode (newCode: string) {
    this.setState({ code: newCode });
  }

  render () {
    var options = {
      lineNumbers: true
    };
    return <CodeMirror value={this.state.code} onChange={this.updateCode} options={options} />
  }

}

ReactDOM.render(<App />, document.getElementById('app'));
