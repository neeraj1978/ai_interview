"use client";

import React, { useState, useEffect } from 'react';
import { Code2, ChevronDown, ChevronUp, Copy, Check, Trash2 } from 'lucide-react';
import Editor from '@monaco-editor/react';

// Language mapping from interview subjects to Monaco language IDs
const SUBJECT_LANGUAGE_MAP = {
  'java': 'java',
  'python': 'python',
  'javascript': 'javascript',
  'js': 'javascript',
  'c++': 'cpp',
  'cpp': 'cpp',
  'c': 'c',
  'go': 'go',
  'rust': 'rust',
  'sql': 'sql',
  'database': 'sql',
  'db': 'sql',
  'typescript': 'typescript',
};

const LANGUAGE_TEMPLATES = {
  java: '// Write your Java code here\npublic class Solution {\n    public static void main(String[] args) {\n        \n    }\n}\n',
  python: '# Write your Python code here\ndef solution():\n    pass\n',
  javascript: '// Write your JavaScript code here\nfunction solution() {\n    \n}\n',
  sql: '-- Write your SQL query here\nSELECT \n    \nFROM \n',
  cpp: '// Write your C++ code here\n#include <iostream>\nusing namespace std;\n\nint main() {\n    \n    return 0;\n}\n',
};

export default function CodeEditor({ subject, onCodeChange, collapsed: initialCollapsed = true }) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [copied, setCopied] = useState(false);
  const [code, setCode] = useState('');
  const [editorLoaded, setEditorLoaded] = useState(false);

  // Determine language by checking if the subject string contains any of our mapped keywords
  let language = 'plaintext';
  if (subject) {
    const lowerSubject = subject.toLowerCase();
    for (const [key, val] of Object.entries(SUBJECT_LANGUAGE_MAP)) {
      if (lowerSubject.includes(key)) {
        language = val;
        break;
      }
    }
  }

  const template = LANGUAGE_TEMPLATES[language] || '// Write your code here\n';

  const handleExpand = () => {
    setCollapsed(false);
  };

  const handleCollapse = () => {
    setCollapsed(true);
  };

  const handleCodeChange = (value) => {
    setCode(value || '');
    if (onCodeChange) onCodeChange(value || '');
  };

  const handleEditorMount = (editor) => {
    setEditorLoaded(true);
    if (!code) {
      setCode(template);
      if (onCodeChange) onCodeChange(template);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code || template);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  };

  const handleClear = () => {
    setCode(template);
    if (onCodeChange) onCodeChange(template);
  };

  if (collapsed) {
    return (
      <button
        onClick={handleExpand}
        className="
          group w-full flex items-center justify-center gap-2.5
          rounded-2xl border border-dashed border-slate-300
          bg-slate-50 px-5 py-3.5
          text-sm font-medium text-slate-500
          hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-600
          transition-all duration-200
        "
      >
        <Code2 className="w-4 h-4" />
        <span>Open Code Editor</span>
        <ChevronDown className="w-3.5 h-3.5 opacity-50 group-hover:opacity-100 transition-opacity" />
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-lg shadow-slate-200/50 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900 border-b border-slate-700">
        <div className="flex items-center gap-2.5">
          <Code2 className="w-4 h-4 text-indigo-400" />
          <span className="text-sm font-semibold text-white">Code Editor</span>
          <span className="px-2 py-0.5 bg-slate-700 rounded-md text-xs font-medium text-slate-300 uppercase tracking-wide">
            {language}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-700 transition-all"
            title="Copy code"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button
            onClick={handleClear}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-amber-400 hover:bg-slate-700 transition-all"
            title="Reset to template"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleCollapse}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-700 transition-all"
            title="Collapse editor"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Editor */}
      <div className="h-[280px] relative bg-[#1e1e1e]">
        <Editor
          height="280px"
          language={language}
          theme="vs-dark"
          value={code || template}
          onChange={handleCodeChange}
          onMount={handleEditorMount}
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            roundedSelection: true,
            padding: { top: 12 },
            suggestOnTriggerCharacters: true,
            wordWrap: 'on',
            tabSize: 4,
            automaticLayout: true,
            scrollbar: {
              vertical: 'auto',
              horizontal: 'auto',
              verticalScrollbarSize: 8,
              horizontalScrollbarSize: 8,
            },
          }}
          loading={
            <div className="flex items-center justify-center h-full bg-[#1e1e1e]">
              <div className="flex items-center gap-2 text-slate-400 text-sm">
                <div className="w-4 h-4 border-2 border-slate-500 border-t-indigo-400 rounded-full animate-spin" />
                Loading editor...
              </div>
            </div>
          }
        />
      </div>
    </div>
  );
}
