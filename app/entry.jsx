import React from "react";
import {render} from "react-dom";

import {importData} from "./importData.jsx";
import {PropListView} from "./propListView.jsx";
import {CodeView} from "./codeView.jsx";

/* 1-> "0001" */
function number4(i) {
  var s = "0000"+i
  return s.substr(s.length-4)
}

class ToggleButton extends React.Component {
  render() {
    return (
      <span
        className={"toolbar-btn toolbar-sw-" + (this.props.isOn ? "on" : "off")}
        onClick={this.props.onClick}
      >
        {this.props.label}
      </span>
    );
  }
}

class ModeSwitcher extends React.Component {
  render() {
    var currentMode = this.props.currentMode;
    var selectMode = this.props.selectMode;
    return (
      <div className="toolbar-group toolbar-em">
        {this.props.modes.map((mode) => (
          <ToggleButton
            key     = {mode.key}
            isOn    = {currentMode == mode.key}
            onClick = {(e)=>selectMode(e, mode.key)}
            label   = {mode.label || mode.name}
          />
        ))}
      </div>
    )
  }
}

class AppPanel extends React.Component {
  render() {
    var content   = this.props.content;
    var noContent = !content || Array.isArray(content) && content.length == 0;
    return (
      <div className={this.props.className}>
        {this.props.toolbar}
        <div className="content-host" onClick={this.props.contentOnClick}>
        {
          noContent ?
          <div className="content-placeholder">
            {this.props.placeholder || "No Data"}
          </div> :
          <div className="content-area">{content}</div>
        }
        </div>
        <div className="pane-resizer"></div>
      </div>
    )
  }
}

function findLineByBytecodeIndex(lines, index)
{
  if (!index) return;
  return lines.find((line)=>(
    line.bytecode && line.bytecode.length != 0 &&
    line.bytecode[0].bcindex <= index &&
    index < line.bytecode[0].bcindex + line.bytecode.length
  ));
}

function findJumpTarget(lines, index)
{
  var line = findLineByBytecodeIndex(lines, index);
  var bytecode = line && line.bytecode[index-line.bytecode[0].bcindex].code;
  if (bytecode) {
    var maybeTarget = bytecode.match(/=>\s*(\d{4})/);
    return maybeTarget && +maybeTarget[1];
  }
}

class LuaCodeView extends React.Component {
  constructor(props) {
    super(props);
    this.state = {};
    this.toggleExpand = this.toggleExpand.bind(this);
    this.collapseViaBcLine = this.collapseViaBcLine.bind(this);
    this.bcLineOnMouseEnter = this.bcLineOnMouseEnter.bind(this);
    this.bcLineOnMouseLeave = this.bcLineOnMouseLeave.bind(this);
  }
  toggleExpand(e) {
    if (this.props.mode != 'lua') {
      /* clicks don't expand things in these modes */
      return;
    }
    e.stopPropagation();
    var lineno = +e.currentTarget.getAttribute("data-lineno");
    var line = this.props.data.find((line) => (line.lineno == lineno));
    if (line) {
      var key = 'expand' + line.key;
      var upd = {};
      upd[key] = !this.state[key] || undefined;
      this.setState(upd);
    }
  }
  collapseViaBcLine(e) {
    if (this.props.mode != 'lua') {
      /* clicks don't expand things in these modes */
      return;
    }
    e.stopPropagation();
    var bcIndex = +e.currentTarget.getAttribute("data-lineno");
    var line = findLineByBytecodeIndex(this.props.data, bcIndex);
    if (line) {
      var key = 'expand' + line.key;
      var upd = {};
      upd[key] = undefined;
      this.setState(upd);
    }
  }
  bcLineOnMouseEnter(e) {
    var index = +e.currentTarget.getAttribute('data-lineno');
    var jumpTarget = findJumpTarget(this.props.data, index);
    if (jumpTarget) {
      this.setState({emBcIndex: jumpTarget});
    }
  }
  bcLineOnMouseLeave(e) {
    var index = +e.currentTarget.getAttribute('data-lineno');
    var jumpTarget = findJumpTarget(this.props.data, index);
    if (jumpTarget) {
      this.setState({emBcIndex: undefined});
    }
  }
  render() {
    var state = this.state;
    var mode = this.props.mode;
    var lines = this.props.data;
    var toggleExpand = this.toggleExpand;
    var collapseViaBcLine = this.collapseViaBcLine;
    var bcLineOnMouseEnter = this.bcLineOnMouseEnter;
    var bcLineOnMouseLeave = this.bcLineOnMouseLeave;
    var emBcIndex = this.state.emBcIndex;
    var content = [];
    var lineDecorator = this.props.lineDecorator || ((l) => l);
    lines.forEach(function(line, i) {
      var mayExpand = line.bytecode || undefined;
      var expanded = state['expand' + line.key];
      var visuallyExpanded = (
        mode != "lua" || expanded
      );
      var emThis = (
        line.bytecode && line.bytecode.length != 0 &&
        line.bytecode[0].bcindex <= emBcIndex &&
        emBcIndex < line.bytecode[0].bcindex + line.bytecode.length
      );
      content.push(
        <CodeView
          className="xcode-line-group lua"
          key={'lua'+i}
          data={[lineDecorator({
            className: (
              emThis && !visuallyExpanded ? "xcode-line em" : "xcode-line"
            ),
            key: line.key,
            lineno: line.lineno,
            code: line.code, codeHi: line.codeHi,
            onClick: toggleExpand,
            gutter: mayExpand && (
              <div className="xgutter">
                <div className={"shevron"+(expanded ? " expanded" : "")}/>
                {line.lineno}
              </div>
            )
          }, line, visuallyExpanded)]}
        />
      );
      if (line.bytecode) {
        content.push(
          <CodeView
            className={"xcode-line-group luabc"+(expanded ? " expanded" : "")}
            key={'luabc'+i}
            data={line.bytecode.map((bc, i)=>lineDecorator({
              key: i,
              lineno: number4(bc.bcindex),
              code: bc.code, codeHi: bc.codeHi,
              className: (
                bc.bcindex == emBcIndex ? "xcode-line em": "xcode-line"
              ),
              onClick: collapseViaBcLine,
              onMouseEnter: bcLineOnMouseEnter,
              onMouseLeave: bcLineOnMouseLeave,
            }, bc))}
          />
        );
      }
    });
    return (
      <div className={"xcode-view primary " + (mode || "")}>
        {content}
      </div>
    );
  }
}

class FuncProtoView extends React.Component {
  render() {
    var proto = this.props.data;
    var selectItem = this.props.selectItem;
    return (
      <div
        className={"panel panel-" + (this.props.selection == proto.id ?
          "primary" : "default")}
        onClick={(e)=>(selectItem(e,proto.id))}
      >
        <div className="panel-heading">
          <h3 className="panel-title">Proto #{proto.index}</h3>
        </div>
        <LuaCodeView
          data={proto.lines}
          mode={this.props.mode}
          lineDecorator={this.props.lineDecorator}
        />
      </div>
    );
  }
}

class PrimaryPanel extends React.Component {
  constructor(props) {
    super(props);
    this.state = {mode: "lua"};
    this.modes = [
      {key:"lua",   label:"Lua"},
      {key:"luabc", label:"Bytecode"},
      {key:"mixed", label:"Mixed"}
    ];
    this.selectMode = this.selectMode.bind(this);
  }
  selectMode(e, mode) {
    e.stopPropagation();
    this.setState({mode: mode})
  }
  makeMenu(modeSwitcher) {
    return <div className="toolbar"><div/>{modeSwitcher}<div/></div>;
  }
  render() {
    var selectItem = this.props.selectItem;
    var selection = this.props.selection;
    var data = this.props.data;
    var error = this.props.error;
    var lineDecorator = this.props.lineDecorator;
    var mode = this.state.mode;
    var toolbar = (this.props.makeMenu || this.makeMenu)(
      <ModeSwitcher
        currentMode = {mode}
        selectMode = {this.selectMode}
        modes = {[
          {key:"lua",   label:"Lua"},
          {key:"luabc", label:"Bytecode"},
          {key:"mixed", label:"Mixed"}
        ]}
      />
    );
    var content = data.map((proto,i) => (
      <FuncProtoView
        key={i}
        data={proto}
        mode={mode}
        selection={selection}
        selectItem={selectItem}
        lineDecorator={lineDecorator}
      />
    ));
    if (error)
      content.splice(0, 0, (
        <div key="error" className="alert alert-danger" role="alert">
          <strong>Something wrong!</strong> {this.props.message}
        </div>
      ));
    return (
      <AppPanel
        className="primary-pane"
        toolbar={toolbar}
        content={content}
        contentOnClick={selectItem}
      />
    );
  }
}

function formatBool(v) {
  if (v == true) return "Yes";
  if (v == false) return "No";
}

/* {const} -> presentation suitable for codeView */
function kToCodeLine(k, i) {
  return {
    key: i,
    lineno: i,
    code: k.value,
    codeHi: k.valueHi
  }
}

class FuncProtoDetailsPanel extends React.Component {
  constructor(props) {
    super(props);
    this.state = {mode: "info"};
    this.modes = [
      {key:"info",   label:"Info"},
      {key:"consts", label:"Consts"},
    ];
    this.infoSchema = [
      {key:"params",     label:"Params"},
      {key:"isvararg",   label:"Is Vararg",    fmt:formatBool},
      {key:"stackslots", label:"Stack Slots"},
      {key:"upvalues",   label:"Upvalues"},
      {key:"bytecodes",  label:"Bytecodes"},
      {key:"nconsts",    label:"Consts"},
      {key:"gcconsts",   label:"GC Consts"},
      {key:"children",   label:"Has Children", fmt:formatBool}
    ];
    this.selectMode = this.selectMode.bind(this);
  }
  selectMode(e, mode) {
    e.stopPropagation();
    this.setState({mode: mode})
  }
  render() {
    var content;
    if (this.state.mode == 'info') {
      content = (
        <PropListView
          data={this.props.data.info}
          schema={this.infoSchema}
        />
      );
    } else {
      content = [];
      var proto = this.props.data;
      if (proto.consts.length != 0) {
        content.push(
          <CodeView
            key='consts'
            className="xcode-view consts"
            data={proto.consts.map(kToCodeLine)}
          />
        );
      }
      if (proto.gcConsts.length != 0) {
        content.push(
          <CodeView
            key='gcConsts'
            className="xcode-view consts"
            data={proto.gcConsts.map(kToCodeLine)}
          />
        );
      }
    }
    return (
      <AppPanel
        className="right-pane"
        content={content}
        toolbar={
          <div className="toolbar">
            <div/>
            <ModeSwitcher
              modes={this.modes}
              currentMode={this.state.mode}
              selectMode={this.selectMode}
            />
            <div/>
          </div>
        }
        placeholder="No Consts"
      />
    );
  }
}

class TraceThumb extends React.Component {
  constructor(props) {
    super(props);
    this.handleClick = this.handleClick.bind(this);
    this.handleMouseOver = this.handleMouseOver.bind(this);
    this.handleMouseOut = this.handleMouseOut.bind(this);
  }
  handleClick(e) {
    this.props.selectItem(e, this.props.data.id);
  }
  handleMouseOver(e) {
    this.props.selectTransient(e, this.props.data.id);
  }
  handleMouseOut(e) {
    this.props.selectTransient(e, null);
  }
  render() {
    var data = this.props.data;
    var className = "trace-thumb";
    if (this.props.selection == data.id)
      className += " active";
    if (data.info.linktype == "interpreter" || !data.info.parent || data.info.error)
      className += " special";
    if (data.info.error)
      className += " error";
    return (
      <div
        className={className}
        onClick={this.handleClick}
        onMouseOver={this.handleMouseOver} onMouseOut={this.handleMouseOut}
      >
        <div>{data.index}</div>
      </div>
    );
  }
}

class TraceBrowserPanel extends React.Component {
  render() {
    var data = this.props.data;
    var selection = this.props.selection;
    var selectItem = this.props.selectItem;
    var selectTransient = this.props.selectTransient;
    return (
      <AppPanel
        className="left-pane"
        toolbar={<div className="toolbar"></div>}
        content={data.filter((item)=>item).map((item, i) => (
          <TraceThumb
            key={i} data={item}
            selection={selection} selectItem={selectItem}
            selectTransient={selectTransient}
          />
        ))}
        contentOnClick={selectItem}
        placeholder="No Traces"
      />
    );
  }
}

class TraceDetailsPanel extends React.Component {
  constructor(props) {
    super(props);
    this.state = {mode: "info"};
    this.modes = [
      {key:"info", label:"Info"},
      {key:"ir",   label:"IR"},
      {key:"asm",  label:"Asm"}
    ];
    this.infoSchema = [
      {key:"error",      label:"Error",      fmt:function(val) {
        if (val) return (
          <span className="error">{val}</span>
        );
      }},
      {key:"observed",   label:"Times Seen", fmt:function(val) {
        if (val > 1) return val;
      }},
      {key:"parent",     label:"Parent"},
      {key:"parentexit", label:"Parent Exit"},
      {key:"link",       label:"Link"},
      {key:"linktype",   label:"Link Type",  fmt:function(val) {
        if (val != "none") return val;
      }},
      {key:"nexit",      label:"Num Exits"}
    ];
    this.selectMode = this.selectMode.bind(this);
    this.irLineOnMouseEnter = this.irLineOnMouseEnter.bind(this);
    this.irLineOnMouseLeave = this.irLineOnMouseLeave.bind(this);
  }
  selectMode(e, mode) {
    e.stopPropagation();
    this.setState({mode: mode})
  }
  irLineOnMouseEnter(e) {
    this.setState({activeIrLine: e.currentTarget.getAttribute('data-lineno')-1});
  }
  irLineOnMouseLeave(e) {
    this.setState({activeIrLine: undefined})
  }
  render() {
    var content;
    var mode = this.state.mode;
    if (mode == "info") {
      content = (
        <PropListView
          data={this.props.data.info}
          schema={this.infoSchema}
        />
      );
    } else if (mode == "ir") {
      var ir = this.props.data.ir;
      if (ir.length != 0) {
        var activeLine = ir[this.state.activeIrLine];
        var emphasize = {};
        if (activeLine) {
          var re = /[0-9]{4,}/g;
          var m;
          while ((m = re.exec(activeLine.code))) {
            emphasize[m[0]-1] = true;
          }
        }
        var irLineOnMouseEnter = this.irLineOnMouseEnter;
        var irLineOnMouseLeave = this.irLineOnMouseLeave;
        content = (
          <CodeView
            className="xcode-view ir"
            data={ir.map((ir, i) => ({
              className: emphasize[i] ? "xcode-line em" : "xcode-line",
              key: i,
              lineno: number4(i+1),
              code: ir.code,
              onMouseEnter: irLineOnMouseEnter,
              onMouseLeave: irLineOnMouseLeave
            }))}
          />
        );
      }
    } else {
      var asm = this.props.data.asm;
      if (asm.length != 0) {
        content = (
          <CodeView
            data={asm.map((asm, i) => ({
              key: i,
              code: asm.code,
              codeHi: asm.codeHi
            }))}
          />
        );
      }
    }
    return (
      <AppPanel
        className="right-pane"
        content={content}
        toolbar={
          <div className="toolbar">
            <div/>
            <ModeSwitcher
              modes={this.modes}
              currentMode={this.state.mode}
              selectMode={this.selectMode}
            />
            <div/>
          </div>
        }
      />
    );
  }
}

class App extends React.Component {
  constructor(props) {
    const input = "local sum = 1\nfor i = 2,10000 do\n\u00a0\u00a0sum = sum + i\nend";
    super(props);
    this.state = {
      data: {protos: [], traces: []},
      selection: null,
      input: input,
      topPanel: true,
      leftPanel: false,
      rightPanel: false
    };
    this.handleTextChange = this.handleTextChange.bind(this);
    this.handleClear = this.handleClear.bind(this);
    this.handleSubmit = this.handleSubmit.bind(this);
    this.selectItem = this.selectItem.bind(this);
    this.selectTransient = this.selectTransient.bind(this);
    this.togglePanel = this.togglePanel.bind(this);
    this.makeMenu = this.makeMenu.bind(this);
  }
  handleTextChange(e) {
    this.setState({input: e.target.value})
  }
  handleClear(e) {
    e.stopPropagation();
    this.setState({input: "", data: {protos: [], traces: []}, selection: null})
  }
  handleSubmit(e) {
    e.stopPropagation();
    $.ajax({
      type: "POST",
      url: "/run",
      dataType: "json",
      async: true,
      data: JSON.stringify({source:this.state.input}),
      success: function(response) {
        console.log(response)
        this.handleResponse(response);
      }.bind(this),
      error: function(response, _, errorText) {
        this.handleResponse(response.responseJson || {error: errorText});
      }.bind(this)
    })
  }
  handleResponse(response) {
    var data = importData(response);
    var update = {data: data};
    /* auto-select first prototype */
    if (this.state.selection == null && data.protos.length != 0)
      update.selection = 'P1';
    this.setState(update);
  }
  selectItem(e, id) {
    e.stopPropagation();
    this.setState({selection: id})
  }
  selectTransient(e, id) {
    e.stopPropagation();
    this.setState({transientSelection: id})
  }
  togglePanel(e, panel) {
    e.stopPropagation();
    var upd = {};
    upd[panel] = !this.state[panel];
    this.setState(upd);
  }
  makeMenu(items) {
    var togglePanel = this.togglePanel.bind(this);
    return (
      <div className="toolbar">
        <div className="toolbar-group">
          <span className="toolbar-btn" onClick={this.handleSubmit}>Update</span>
          <span className="toolbar-btn" onClick={this.handleClear}>Clear</span>
        </div>
        {items}
        <div className="toolbar-group">
          <ToggleButton
            isOn    = {this.state.leftPanel}
            onClick = {(e)=>togglePanel(e, "leftPanel")}
            label   = {<span className="pane-toggle-icon">&#x258f;</span>}
          />
          <ToggleButton
            isOn    = {this.state.topPanel}
            onClick = {(e)=>togglePanel(e, "topPanel")}
            label   = {<span className="pane-toggle-icon">&#x2594;</span>}
          />
          <ToggleButton
            isOn    = {this.state.rightPanel}
            onClick = {(e)=>togglePanel(e, "rightPanel")}
            label   = {<span className="pane-toggle-icon">&#x2595;</span>}
          />
        </div>
      </div>
    );
  }
  makeRightPanel() {
    var selection = this.state.selection;
    if (selection) {
      var protoSelected = selection.match(/P([0-9]+)/);
      if (protoSelected) {
        var index = protoSelected[1] - 1;
        /* may become invalid after reload */
        if (this.state.data.protos[index])
          return <FuncProtoDetailsPanel data={this.state.data.protos[index]}/>;
      }
      var traceSelected = selection.match(/T([0-9]+)/);
      if (traceSelected) {
        var index = traceSelected[1] - 1;
        /* may become invalid after reload */
        if (this.state.data.traces[index])
          return <TraceDetailsPanel data={this.state.data.traces[index]}/>;
      }
    }
    return (
      <AppPanel
        className="right-pane"
        toolbar={<div className="toolbar"></div>}
        placeholder="No Selection"
      />
    );
  }
  createLineDecorator() {
    var trace, selection = this.state.transientSelection || this.state.selection;
    if (selection) {
      var traceSelected = selection.match(/T([0-9]+)/);
      if (traceSelected)
        trace = this.state.data.traces[traceSelected[1]-1];
    }
    if (trace) {
      var highlightMap = {};
      trace.trace.forEach((br, i) =>
        (highlightMap[br] = i)
      );
      var decorationMap = {};
      var protos = this.state.data.protos;
      var lastLine, lastSubIndex = 0, lastIndex = 0;
      trace.trace.forEach(function(bcref) {
        var match = bcref.match(/BR(\d+):(\d+)/);
        var proto = protos[match[1]-1];
        var bcIndex = +match[2];
        var line = proto.lines[proto.bytecodeMap[bcIndex-1]-proto.lines[0].lineno];
        var bytecodeDecoration = decorationMap[bcref];
        if (!bytecodeDecoration) {
          bytecodeDecoration = [];
          decorationMap[bcref] = bytecodeDecoration;
        }
        if (line !== lastLine) {
          var lineDecoration = decorationMap[line.id];
          if (!lineDecoration) {
            lineDecoration = [];
            decorationMap[line.id] = lineDecoration;
          }
          lineDecoration.push(++lastIndex+"");
          lastSubIndex = 0;
        }
        bytecodeDecoration.push(lastIndex + "." + (++lastSubIndex));
        lastLine = line;
      });
      if (trace.info.error) {
        var lastBcref = trace.trace[trace.trace.length - 1];
        if (lastBcref) {
          decorationMap[lastBcref].push(trace.info.error);
          var match = lastBcref.match(/BR(\d+):(\d+)/);
          var proto = protos[match[1]-1];
          var bcIndex = +match[2];
          var line = proto.lines[proto.bytecodeMap[bcIndex-1]-1];
          decorationMap[line.id].push(trace.info.error);
        }
      }
      return function(aline, entity, visuallyExpanded) {
        var highlightCurrent;
        if (entity.bcindex) {
          highlightCurrent = (highlightMap[entity.id] !== undefined);
        } else if (visuallyExpanded) {
          highlightCurrent = (entity.bytecode && entity.bytecode.every((bc) =>
            highlightMap[bc.id] !== undefined
          ));
        } else {
          highlightCurrent = (entity.bytecode && entity.bytecode.find((bc) =>
            highlightMap[bc.id] !== undefined
          ));
        }
        if (highlightCurrent) {
          aline.className += " active-trace";
          if (trace.info.error)
            aline.className += " error";
          aline.overlay = (
            <div className="xcode-overlay">{
              decorationMap[entity.id].map((decoration, i) => (
                <span key={i}>{decoration}</span>
              ))
            }</div>
          );
        }
        return aline;
      }
    }
  }
  render () {
    var selection = this.state.selection;
    var data = this.state.data;
    return (
      <div className="app-container">
        {
          this.state.topPanel == false ? "" :
          <div className="top-pane">
            <textarea
              rows="5" onChange={this.handleTextChange}
              value={this.state.input}
            />
          </div>
        }
        <div className="app-main">
          {
            this.state.leftPanel == false ? "" :
            <TraceBrowserPanel
              data={data.traces}
              selection={selection}
              selectItem={this.selectItem}
              selectTransient={this.selectTransient}
            />
          }
          <PrimaryPanel
            data={data.protos}
            error={data.error}
            selection={selection}
            selectItem={this.selectItem}
            makeMenu={this.makeMenu}
            lineDecorator={this.createLineDecorator()}
          />
          {
            this.state.rightPanel == false ? "" : this.makeRightPanel()
          }
        </div>
      </div>
    );
  }
}

render(<App/>, document.getElementById('app'));
