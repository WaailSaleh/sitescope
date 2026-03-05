import { useState } from 'react'

// Build a nested tree from flat file paths
function buildTree(files) {
  const root = {}
  for (const file of files) {
    const parts = file.path.replace(/^\//, '').split('/')
    let node = root
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]
      if (!node[part]) node[part] = { __dir: true, __children: {} }
      node = node[part].__children
    }
    const filename = parts[parts.length - 1]
    node[filename] = { __dir: false, __file: file }
  }
  return root
}

function FileIcon({ lang }) {
  const colors = {
    typescript: '#4488ff', javascript: '#ffb800',
    vue: '#00cc6a', svelte: '#ff4455',
    css: '#aa88ff', json: '#ff8844',
    python: '#44aaff', text: '#888888',
  }
  const labels = {
    typescript: 'TS', javascript: 'JS', vue: 'VUE',
    svelte: 'SVE', css: 'CSS', json: 'JSON',
    python: 'PY', text: 'TXT',
  }
  return (
    <span
      className="text-xs px-1 rounded shrink-0"
      style={{
        background: `${colors[lang] || '#888'}22`,
        color: colors[lang] || '#888',
        border: `1px solid ${colors[lang] || '#888'}44`,
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: '0.05em',
      }}
    >
      {labels[lang] || 'TXT'}
    </span>
  )
}

function TreeNode({ name, node, depth, onSelect, selectedPath }) {
  const [open, setOpen] = useState(depth < 2)

  if (node.__dir) {
    return (
      <div>
        <button
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-1.5 w-full text-left py-0.5 px-1 rounded hover:bg-white/5 text-xs"
          style={{ paddingLeft: depth * 12 + 4, color: 'var(--text-dim)' }}
        >
          <span style={{ color: 'var(--amber)', fontSize: 10 }}>{open ? '▾' : '▸'}</span>
          <span style={{ color: 'var(--text-dim)' }}>📁</span>
          <span>{name}</span>
        </button>
        {open && Object.entries(node.__children).sort(([, a], [, b]) => {
          if (a.__dir && !b.__dir) return -1
          if (!a.__dir && b.__dir) return 1
          return 0
        }).map(([childName, childNode]) => (
          <TreeNode
            key={childName}
            name={childName}
            node={childNode}
            depth={depth + 1}
            onSelect={onSelect}
            selectedPath={selectedPath}
          />
        ))}
      </div>
    )
  }

  const file = node.__file
  const isSelected = selectedPath === file.path

  return (
    <button
      onClick={() => onSelect(file)}
      className="flex items-center gap-1.5 w-full text-left py-0.5 px-1 rounded text-xs transition-colors"
      style={{
        paddingLeft: depth * 12 + 4,
        background: isSelected ? 'rgba(0,255,136,0.08)' : 'transparent',
        color: isSelected ? 'var(--green)' : file.has_content ? 'var(--text)' : 'var(--text-dim)',
        borderLeft: isSelected ? '2px solid var(--green)' : '2px solid transparent',
      }}
    >
      <FileIcon lang={file.lang} />
      <span className="truncate flex-1">{name}</span>
      {!file.has_content && (
        <span className="text-xs shrink-0" style={{ color: 'var(--muted)', fontSize: 9 }}>path only</span>
      )}
    </button>
  )
}

function SourceViewer({ file }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(file.content || file.path)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="flex flex-col h-full">
      {/* File header */}
      <div
        className="flex items-center justify-between px-3 py-2 shrink-0"
        style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <FileIcon lang={file.lang} />
          <span className="text-xs font-mono truncate" style={{ color: 'var(--text)' }}>
            {file.path}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {file.size > 0 && (
            <span className="text-xs" style={{ color: 'var(--muted)' }}>
              {(file.size / 1024).toFixed(1)}kb
            </span>
          )}
          <button
            onClick={handleCopy}
            className="text-xs px-2 py-0.5 rounded transition-colors"
            style={{
              background: 'var(--surface)',
              color: copied ? 'var(--green)' : 'var(--text-dim)',
              border: '1px solid var(--border)',
            }}
          >
            {copied ? '✓ copied' : 'copy'}
          </button>
        </div>
      </div>

      {/* Source content */}
      <div className="flex-1 overflow-auto">
        {file.has_content ? (
          <pre
            className="text-xs p-4 font-mono"
            style={{
              color: 'var(--text)',
              lineHeight: 1.6,
              tabSize: 2,
              whiteSpace: 'pre',
              margin: 0,
            }}
          >
            {/* Line numbers + content */}
            {file.content.split('\n').map((line, i) => (
              <div key={i} className="flex gap-4 hover:bg-white/5">
                <span
                  className="select-none text-right shrink-0"
                  style={{ color: 'var(--muted)', minWidth: 32, userSelect: 'none' }}
                >
                  {i + 1}
                </span>
                <span style={{ color: 'var(--text)' }}>{line || ' '}</span>
              </div>
            ))}
          </pre>
        ) : (
          <div className="p-4 text-xs" style={{ color: 'var(--muted)' }}>
            <p className="mb-2">
              This file path was recovered from the source map but the source code was not embedded
              (<code>sourcesContent</code> not present in the map file).
            </p>
            <p>
              Original path: <span style={{ color: 'var(--amber)' }}>{file.original_path}</span>
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function ExposureBadge({ exposure }) {
  return exposure === 'full_source' ? (
    <span className="badge-high px-2 py-0.5 text-xs rounded font-semibold">FULL SOURCE</span>
  ) : (
    <span className="badge-medium px-2 py-0.5 text-xs rounded font-semibold">PATHS ONLY</span>
  )
}

export default function SourceMapViewer({ sourceMaps }) {
  const [activeMapIdx, setActiveMapIdx] = useState(0)
  const [selectedFile, setSelectedFile] = useState(null)

  if (!sourceMaps || sourceMaps.length === 0) {
    return (
      <div className="py-12 text-center text-xs" style={{ color: 'var(--muted)' }}>
        ✓ No source maps found on this target.
      </div>
    )
  }

  const activeMap = sourceMaps[activeMapIdx]
  const tree = buildTree(activeMap.files)
  const fullSourceFiles = activeMap.files.filter(f => f.has_content)

  return (
    <div className="animate-fade-in">
      {/* Map selector (if multiple) */}
      {sourceMaps.length > 1 && (
        <div className="flex gap-2 mb-4 flex-wrap">
          {sourceMaps.map((sm, i) => (
            <button
              key={i}
              onClick={() => { setActiveMapIdx(i); setSelectedFile(null) }}
              className="text-xs px-3 py-1.5 rounded transition-colors"
              style={{
                background: i === activeMapIdx ? 'rgba(0,255,136,0.08)' : 'var(--surface-2)',
                color: i === activeMapIdx ? 'var(--green)' : 'var(--text-dim)',
                border: `1px solid ${i === activeMapIdx ? 'rgba(0,255,136,0.2)' : 'var(--border)'}`,
              }}
            >
              {sm.map_url.split('/').pop()}
            </button>
          ))}
        </div>
      )}

      {/* Map summary */}
      <div
        className="p-3 rounded mb-4 flex items-center gap-4 flex-wrap"
        style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
      >
        <ExposureBadge exposure={activeMap.exposure} />
        <span className="text-xs" style={{ color: 'var(--text-dim)' }}>
          <span style={{ color: 'var(--text)' }}>{activeMap.file_count}</span> files recovered
        </span>
        {fullSourceFiles.length > 0 && (
          <span className="text-xs" style={{ color: 'var(--text-dim)' }}>
            <span style={{ color: 'var(--green)' }}>{fullSourceFiles.length}</span> with source code
          </span>
        )}
        <span className="text-xs font-mono truncate" style={{ color: 'var(--muted)' }}>
          {activeMap.map_url}
        </span>
      </div>

      {/* Split pane: file tree + viewer */}
      <div
        className="rounded overflow-hidden flex"
        style={{
          border: '1px solid var(--border)',
          height: 480,
          background: 'var(--surface)',
        }}
      >
        {/* File tree */}
        <div
          className="overflow-y-auto py-2 shrink-0"
          style={{
            width: 240,
            borderRight: '1px solid var(--border)',
            background: 'var(--surface-2)',
          }}
        >
          <div className="px-3 pb-2 text-xs uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
            recovered files
          </div>
          {Object.entries(tree).sort(([, a], [, b]) => {
            if (a.__dir && !b.__dir) return -1
            if (!a.__dir && b.__dir) return 1
            return 0
          }).map(([name, node]) => (
            <TreeNode
              key={name}
              name={name}
              node={node}
              depth={0}
              onSelect={setSelectedFile}
              selectedPath={selectedFile?.path}
            />
          ))}
        </div>

        {/* Source viewer */}
        <div className="flex-1 overflow-hidden">
          {selectedFile ? (
            <SourceViewer file={selectedFile} />
          ) : (
            <div className="h-full flex flex-col items-center justify-center gap-2">
              <span className="text-xs" style={{ color: 'var(--muted)' }}>
                ← select a file to view source
              </span>
              {activeMap.exposure === 'full_source' && (
                <span className="text-xs" style={{ color: 'var(--red)' }}>
                  ⚠ Full pre-minification source code is exposed
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
