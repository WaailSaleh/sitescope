import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

/* ═══════════════════════════════════════════════════════════════════
   TOKEN-BASED SYNTAX HIGHLIGHTER
   No external deps — covers JS/TS, CSS, JSON, Python, plain text
═══════════════════════════════════════════════════════════════════ */
const JS_KEYWORDS = new Set([
  'const', 'let', 'var', 'function', 'class', 'return', 'if', 'else', 'for', 'while',
  'do', 'switch', 'case', 'break', 'continue', 'new', 'delete', 'typeof', 'instanceof',
  'in', 'of', 'try', 'catch', 'finally', 'throw', 'async', 'await', 'import', 'export',
  'default', 'from', 'as', 'extends', 'super', 'this', 'null', 'undefined', 'true',
  'false', 'void', 'static', 'get', 'set', 'interface', 'type', 'enum', 'implements',
  'declare', 'abstract', 'override', 'readonly', 'namespace', 'module', 'require',
])
const PY_KEYWORDS = new Set([
  'def', 'class', 'return', 'if', 'elif', 'else', 'for', 'while', 'import', 'from',
  'as', 'with', 'try', 'except', 'finally', 'raise', 'pass', 'break', 'continue',
  'and', 'or', 'not', 'in', 'is', 'lambda', 'yield', 'async', 'await', 'True', 'False',
  'None', 'global', 'nonlocal', 'del', 'assert',
])

function tokenize(code, lang) {
  if (!code) return []
  const tokens = []
  let i = 0
  const keywords = lang === 'python' ? PY_KEYWORDS : JS_KEYWORDS
  const isCssLike = lang === 'css'
  const isJson = lang === 'json'

  while (i < code.length) {
    // Line comment //
    if (!isCssLike && !isJson && code[i] === '/' && code[i + 1] === '/') {
      const end = code.indexOf('\n', i)
      const val = end === -1 ? code.slice(i) : code.slice(i, end)
      tokens.push({ type: 'comment', value: val })
      i += val.length
      continue
    }
    // Block comment /* */
    if (code[i] === '/' && code[i + 1] === '*') {
      const end = code.indexOf('*/', i + 2)
      const val = end === -1 ? code.slice(i) : code.slice(i, end + 2)
      tokens.push({ type: 'comment', value: val })
      i += val.length
      continue
    }
    // Python comment #
    if (lang === 'python' && code[i] === '#') {
      const end = code.indexOf('\n', i)
      const val = end === -1 ? code.slice(i) : code.slice(i, end)
      tokens.push({ type: 'comment', value: val })
      i += val.length
      continue
    }
    // Template literals
    if (code[i] === '`') {
      let j = i + 1
      while (j < code.length) {
        if (code[j] === '\\') { j += 2; continue }
        if (code[j] === '`') { j++; break }
        j++
      }
      tokens.push({ type: 'string', value: code.slice(i, j) })
      i = j
      continue
    }
    // String " or '
    if (code[i] === '"' || code[i] === "'") {
      const q = code[i]
      let j = i + 1
      while (j < code.length) {
        if (code[j] === '\\') { j += 2; continue }
        if (code[j] === q) { j++; break }
        if (code[j] === '\n') break
        j++
      }
      tokens.push({ type: 'string', value: code.slice(i, j) })
      i = j
      continue
    }
    // Numbers
    if (/[0-9]/.test(code[i]) || (code[i] === '.' && /[0-9]/.test(code[i + 1] || ''))) {
      let j = i
      while (j < code.length && /[0-9a-fA-FxX_.]/.test(code[j])) j++
      tokens.push({ type: 'number', value: code.slice(i, j) })
      i = j
      continue
    }
    // Identifiers / keywords
    if (/[a-zA-Z_$]/.test(code[i])) {
      let j = i
      while (j < code.length && /[a-zA-Z0-9_$]/.test(code[j])) j++
      const word = code.slice(i, j)
      // Check if followed by ( → function call
      let k = j
      while (k < code.length && code[k] === ' ') k++
      if (code[k] === '(') {
        tokens.push({ type: keywords.has(word) ? 'keyword' : 'function', value: word })
      } else if (keywords.has(word)) {
        tokens.push({ type: 'keyword', value: word })
      } else if (/^[A-Z]/.test(word)) {
        tokens.push({ type: 'type', value: word })
      } else {
        tokens.push({ type: 'ident', value: word })
      }
      i = j
      continue
    }
    // CSS property (word before colon)
    // JSON key (string before colon handled above)
    // Operators & punctuation
    const ch = code[i]
    if ('{}[]();,.<>!&|=+-*/%^~?:@'.includes(ch)) {
      tokens.push({ type: 'operator', value: ch })
      i++
      continue
    }
    tokens.push({ type: 'plain', value: ch })
    i++
  }
  return tokens
}

const TOKEN_COLORS = {
  keyword: '#cc88ff',  // purple
  string: '#a8cc8c',  // green
  number: '#f0a050',  // orange
  comment: '#555555',  // muted
  function: '#7ab4f5',  // blue
  type: '#4dc9b0',  // teal
  operator: '#c8c8c8',  // normal text
  ident: '#c8c8c8',
  plain: '#c8c8c8',
}

function HighlightedLine({ tokens, searchTerm, lineNum, activeLine, onLineClick }) {
  const isActive = activeLine === lineNum
  return (
    <div
      className="flex items-start group cursor-pointer"
      style={{ background: isActive ? 'rgba(255,255,255,0.04)' : 'transparent' }}
      onClick={() => onLineClick(lineNum)}
    >
      <span
        className="select-none text-right shrink-0 px-3 py-0"
        style={{ color: isActive ? 'var(--text-dim)' : 'var(--border-bright)', minWidth: 44, fontSize: 11, lineHeight: 'inherit', userSelect: 'none' }}
      >
        {lineNum}
      </span>
      <span className="flex-1 px-2 whitespace-pre" style={{ lineHeight: 'inherit' }}>
        {tokens.map((tok, i) => {
          if (searchTerm && tok.value.toLowerCase().includes(searchTerm.toLowerCase())) {
            // Split and highlight matches
            const parts = tok.value.split(new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'))
            return (
              <span key={i} style={{ color: TOKEN_COLORS[tok.type] }}>
                {parts.map((p, j) =>
                  p.toLowerCase() === searchTerm.toLowerCase()
                    ? <mark key={j} style={{ background: 'rgba(255,184,0,0.35)', color: '#ffd080', borderRadius: 2 }}>{p}</mark>
                    : p
                )}
              </span>
            )
          }
          return <span key={i} style={{ color: TOKEN_COLORS[tok.type] }}>{tok.value}</span>
        })}
      </span>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   FILE TREE
═══════════════════════════════════════════════════════════════════ */
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

const LANG_LABELS = { typescript: 'TS', javascript: 'JS', vue: 'VUE', svelte: 'SVE', css: 'CSS', json: 'JSON', python: 'PY', text: 'TXT' }
const LANG_COLORS = { typescript: '#4488ff', javascript: '#ffb800', vue: '#00cc6a', svelte: '#ff6600', css: '#cc88ff', json: '#ff8844', python: '#44bbff', text: '#888' }

function FileIcon({ lang, size = 'normal' }) {
  const c = LANG_COLORS[lang] || '#888'
  return (
    <span className="shrink-0 px-1 rounded font-bold" style={{ background: `${c}22`, color: c, border: `1px solid ${c}44`, fontSize: size === 'sm' ? 8 : 9, letterSpacing: '0.05em' }}>
      {LANG_LABELS[lang] || 'TXT'}
    </span>
  )
}

function TreeNode({ name, node, depth, onSelect, openPaths, setOpenPaths, activePath }) {
  const pathKey = `${depth}:${name}`

  if (node.__dir) {
    const isOpen = openPaths.has(pathKey)
    const childCount = Object.keys(node.__children).length
    return (
      <div>
        <button
          onClick={() => setOpenPaths(prev => { const s = new Set(prev); isOpen ? s.delete(pathKey) : s.add(pathKey); return s })}
          className="flex items-center gap-1.5 w-full text-left py-0.5 rounded hover:bg-white/5 text-xs"
          style={{ paddingLeft: depth * 12 + 8, color: 'var(--text-dim)' }}
        >
          <span style={{ color: 'var(--amber)', fontSize: 9, width: 10 }}>{isOpen ? '▾' : '▸'}</span>
          <span style={{ fontSize: 12 }}>📁</span>
          <span className="truncate">{name}</span>
          <span style={{ color: 'var(--border-bright)', fontSize: 9 }}>{childCount}</span>
        </button>
        {isOpen && Object.entries(node.__children)
          .sort(([, a], [, b]) => (a.__dir && !b.__dir ? -1 : !a.__dir && b.__dir ? 1 : 0))
          .map(([childName, childNode]) => (
            <TreeNode key={childName} name={childName} node={childNode} depth={depth + 1}
              onSelect={onSelect} openPaths={openPaths} setOpenPaths={setOpenPaths} activePath={activePath} />
          ))}
      </div>
    )
  }

  const file = node.__file
  const isActive = activePath === file.path
  return (
    <button
      onClick={() => onSelect(file)}
      className="flex items-center gap-1.5 w-full text-left py-0.5 rounded text-xs transition-colors"
      style={{ paddingLeft: depth * 12 + 8, background: isActive ? 'rgba(0,255,136,0.08)' : 'transparent', borderLeft: isActive ? '2px solid var(--green)' : '2px solid transparent', color: isActive ? 'var(--green)' : file.has_content ? 'var(--text)' : 'var(--muted)' }}
    >
      <FileIcon lang={file.lang} />
      <span className="truncate flex-1">{name}</span>
      {!file.has_content && <span style={{ fontSize: 8, color: 'var(--border-bright)' }}>∅</span>}
    </button>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   PENTEST SCANNER  — runs regex across all files
═══════════════════════════════════════════════════════════════════ */
const PENTEST_PATTERNS = [
  {
    id: 'secrets', label: '🔑 Hardcoded Secrets', severity: 'HIGH',
    regex: /(?:api[_-]?key|token|secret|password|auth|bearer|apikey|access_key)[^\w][\s=:'"]{0,8}['"`]?([a-zA-Z0-9_\-]{16,80})/gi
  },
  {
    id: 'endpoints', label: '🌐 API Endpoints', severity: 'INFO',
    regex: /['"`](\/(?:api|v[0-9]+|rest|graphql|gql)\/[a-zA-Z0-9_/\-:]{2,120})['"`]/g
  },
  {
    id: 'envvars', label: '⚙ process\.env Refs', severity: 'LOW',
    regex: /process\.env\.([A-Z][A-Z0-9_]{2,60})/g
  },
  {
    id: 'urls', label: '🔗 External URLs', severity: 'INFO',
    regex: /https?:\/\/[a-zA-Z0-9\-_./]{8,100}/g
  },
  {
    id: 'dangerops', label: '⚠ Dangerous Operations', severity: 'MEDIUM',
    regex: /\b(eval|Function\(|innerHTML|outerHTML|document\.write|exec\(|subprocess\.|os\.system|child_process)\b/g
  },
  {
    id: 'comments', label: '📝 Dev Comments (TODO/HACK/FIXME)', severity: 'INFO',
    regex: /\/\/\s*(TODO|FIXME|HACK|XXX|BUG|NOTE|TEMP|WORKAROUND)[:\s].{0,120}/gi
  },
  {
    id: 'crypto', label: '🔐 Weak Crypto Patterns', severity: 'MEDIUM',
    regex: /\b(md5|sha1|DES|RC4|createCipheriv\(['"]aes-128)/gi
  },
]

const SEVERITY_COLORS = { HIGH: 'var(--red)', MEDIUM: 'var(--amber)', LOW: 'var(--blue)', INFO: 'var(--muted)' }
const SEVERITY_BG = { HIGH: 'rgba(255,68,85,0.08)', MEDIUM: 'rgba(255,184,0,0.08)', LOW: 'rgba(68,136,255,0.08)', INFO: 'rgba(136,136,136,0.06)' }

function runPentest(files) {
  const results = []
  for (const pat of PENTEST_PATTERNS) {
    const hits = []
    for (const file of files) {
      if (!file.has_content || !file.content) continue
      const lines = file.content.split('\n')
      pat.regex.lastIndex = 0
      lines.forEach((line, lineIdx) => {
        pat.regex.lastIndex = 0
        let m
        while ((m = pat.regex.exec(line)) !== null) {
          hits.push({ file: file.path, lang: file.lang, line: lineIdx + 1, match: m[0].slice(0, 120), col: m.index })
          if (hits.length > 200) break
        }
      })
      if (hits.length > 200) break
    }
    if (hits.length) results.push({ ...pat, hits })
  }
  return results
}

/* ═══════════════════════════════════════════════════════════════════
   CODE EDITOR PANE
═══════════════════════════════════════════════════════════════════ */
function CodeEditor({ file, searchTerm, jumpToLine }) {
  const [activeLine, setActiveLine] = useState(null)
  const scrollRef = useRef(null)
  const lineRefs = useRef({})

  const lines = useMemo(() => file?.content?.split('\n') || [], [file])

  const tokenizedLines = useMemo(() => {
    if (!file?.has_content) return []
    return lines.map(line => tokenize(line, file.lang))
  }, [lines, file])

  useEffect(() => { setActiveLine(null) }, [file])

  useEffect(() => {
    if (jumpToLine && lineRefs.current[jumpToLine]) {
      lineRefs.current[jumpToLine].scrollIntoView({ behavior: 'smooth', block: 'center' })
      setActiveLine(jumpToLine)
    }
  }, [jumpToLine])

  if (!file) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 select-none" style={{ background: 'var(--bg)' }}>
        <span style={{ fontSize: 32 }}>🗂️</span>
        <span className="text-xs" style={{ color: 'var(--muted)' }}>Select a file from the explorer</span>
      </div>
    )
  }

  if (!file.has_content) {
    return (
      <div className="h-full flex flex-col p-6 gap-3" style={{ background: 'var(--bg)' }}>
        <div className="text-xs font-semibold" style={{ color: 'var(--amber)' }}>⚠ Path exposed — no source content embedded</div>
        <div className="text-xs" style={{ color: 'var(--text-dim)' }}>
          The source map references this file but <code style={{ color: 'var(--text)' }}>sourcesContent</code> was not included.
        </div>
        <div className="mt-2 p-3 rounded text-xs font-mono" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--amber)' }}>
          {file.original_path}
        </div>
        <div className="text-xs mt-2" style={{ color: 'var(--muted)' }}>
          Pentest note: the path structure reveals the project layout even without source content.
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg)' }}>
      <div
        ref={scrollRef}
        className="flex-1 overflow-auto"
        style={{ fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: '20px' }}
      >
        <div className="py-2">
          {tokenizedLines.map((tokens, idx) => {
            const lineNum = idx + 1
            return (
              <div key={lineNum} ref={el => lineRefs.current[lineNum] = el}>
                <HighlightedLine
                  tokens={tokens}
                  searchTerm={searchTerm}
                  lineNum={lineNum}
                  activeLine={activeLine}
                  onLineClick={setActiveLine}
                />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   GLOBAL SEARCH PANEL
═══════════════════════════════════════════════════════════════════ */
function SearchPanel({ files, onJumpTo }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    if (!query || query.length < 2) { setResults([]); return }
    const hits = []
    for (const file of files) {
      if (!file.has_content || !file.content) continue
      const lines = file.content.split('\n')
      lines.forEach((line, idx) => {
        if (line.toLowerCase().includes(query.toLowerCase())) {
          hits.push({ file, line: idx + 1, text: line.trim().slice(0, 120) })
          if (hits.length >= 300) return
        }
      })
      if (hits.length >= 300) break
    }
    setResults(hits)
  }, [query, files])

  const grouped = useMemo(() => {
    const g = {}
    for (const hit of results) {
      if (!g[hit.file.path]) g[hit.file.path] = { file: hit.file, hits: [] }
      g[hit.file.path].hits.push(hit)
    }
    return Object.values(g)
  }, [results])

  return (
    <div className="flex flex-col h-full">
      <div className="p-2 shrink-0">
        <div className="flex items-center gap-1 px-2 rounded" style={{ background: 'var(--surface)', border: '1px solid var(--border-bright)' }}>
          <span style={{ color: 'var(--muted)', fontSize: 12 }}>⌕</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search across all files..."
            className="flex-1 bg-transparent py-1.5 text-xs outline-none"
            style={{ color: 'var(--text)', caretColor: 'var(--green)' }}
          />
          {query && <span className="text-xs shrink-0" style={{ color: 'var(--muted)' }}>{results.length} hits</span>}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {grouped.map(group => (
          <div key={group.file.path} className="mb-2">
            <div className="flex items-center gap-1.5 px-2 py-1 sticky top-0" style={{ background: 'var(--surface-2)' }}>
              <FileIcon lang={group.file.lang} size="sm" />
              <span className="text-xs truncate" style={{ color: 'var(--text-dim)' }}>{group.file.path}</span>
              <span className="text-xs shrink-0 ml-auto" style={{ color: 'var(--muted)' }}>{group.hits.length}</span>
            </div>
            {group.hits.map((hit, i) => (
              <button
                key={i}
                onClick={() => onJumpTo(hit.file, hit.line)}
                className="w-full flex items-start gap-2 px-3 py-1 text-left hover:bg-white/5 group"
              >
                <span className="shrink-0 text-xs" style={{ color: 'var(--border-bright)', minWidth: 28, textAlign: 'right' }}>{hit.line}</span>
                <span className="text-xs font-mono truncate" style={{ color: 'var(--text-dim)' }}>
                  {hit.text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')).map((p, j) =>
                    p.toLowerCase() === query.toLowerCase()
                      ? <mark key={j} style={{ background: 'rgba(255,184,0,0.3)', color: '#ffd080', borderRadius: 2 }}>{p}</mark>
                      : p
                  )}
                </span>
              </button>
            ))}
          </div>
        ))}
        {query.length >= 2 && results.length === 0 && (
          <div className="p-4 text-xs text-center" style={{ color: 'var(--muted)' }}>No results for "{query}"</div>
        )}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   PENTEST PANEL
═══════════════════════════════════════════════════════════════════ */
function PentestPanel({ files, onJumpTo }) {
  const results = useMemo(() => runPentest(files), [files])
  const [expanded, setExpanded] = useState(new Set(results.filter(r => r.severity === 'HIGH' || r.severity === 'MEDIUM').map(r => r.id)))

  if (!results.length) {
    return (
      <div className="p-4 text-xs text-center" style={{ color: 'var(--green)' }}>
        <div className="text-xl mb-2">✓</div>
        No suspicious patterns found in the recovered source files.
      </div>
    )
  }

  const totalHits = results.reduce((acc, r) => acc + r.hits.length, 0)

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-3 py-2 shrink-0 text-xs" style={{ color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
        {totalHits} finding{totalHits !== 1 ? 's' : ''} across {results.length} pattern{results.length !== 1 ? 's' : ''}
      </div>
      {results.map(result => {
        const isOpen = expanded.has(result.id)
        return (
          <div key={result.id} className="border-b" style={{ borderColor: 'var(--border)' }}>
            <button
              onClick={() => setExpanded(prev => { const s = new Set(prev); isOpen ? s.delete(result.id) : s.add(result.id); return s })}
              className="w-full flex items-center gap-2 px-3 py-2 text-left"
              style={{ background: isOpen ? SEVERITY_BG[result.severity] : 'transparent' }}
            >
              <motion.span style={{ display: 'inline-block', color: 'var(--text-dim)', fontSize: 10 }} animate={{ rotate: isOpen ? 0 : -90 }} transition={{ duration: 0.15 }}>▼</motion.span>
              <span className="text-xs flex-1">{result.label}</span>
              <span className="text-xs px-1.5 py-0.5 rounded shrink-0" style={{ color: SEVERITY_COLORS[result.severity], background: SEVERITY_BG[result.severity] }}>{result.severity}</span>
              <span className="text-xs shrink-0" style={{ color: 'var(--muted)' }}>{result.hits.length}</span>
            </button>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden">
                  {result.hits.slice(0, 50).map((hit, i) => (
                    <button
                      key={i}
                      onClick={() => onJumpTo(hit.file || files.find(f => f.path === hit.file), hit.line)}
                      className="w-full flex items-start gap-2 px-4 py-1 text-left hover:bg-white/5"
                    >
                      <span className="text-xs shrink-0" style={{ color: 'var(--border-bright)', minWidth: 28, textAlign: 'right' }}>{hit.line}</span>
                      <span className="text-xs font-mono truncate flex-1" style={{ color: SEVERITY_COLORS[result.severity] }}>{hit.match}</span>
                      <span className="text-xs shrink-0 truncate max-w-24" style={{ color: 'var(--muted)' }}>
                        {hit.file.split('/').pop()}
                      </span>
                    </button>
                  ))}
                  {result.hits.length > 50 && (
                    <div className="px-4 py-1 text-xs" style={{ color: 'var(--muted)' }}>… and {result.hits.length - 50} more</div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )
      })}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN EXPORT
═══════════════════════════════════════════════════════════════════ */
export default function SourceMapViewer({ sourceMaps }) {
  const [activeMapIdx, setActiveMapIdx] = useState(0)
  const [openTabs, setOpenTabs] = useState([])        // array of file objects
  const [activeTabPath, setActiveTabPath] = useState(null)
  const [sidebarPanel, setSidebarPanel] = useState('explorer')  // 'explorer' | 'search' | 'pentest'
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [jumpToLine, setJumpToLine] = useState(null)
  const [openFolders, setOpenFolders] = useState(() => new Set(['0:src', '0:app', '0:pages', '0:components', '0:lib', '0:utils']))
  const [treeSearch, setTreeSearch] = useState('')

  if (!sourceMaps || sourceMaps.length === 0) {
    return (
      <div className="py-12 text-center text-xs" style={{ color: 'var(--muted)' }}>
        <div className="text-2xl mb-2" style={{ color: 'var(--green)' }}>✓</div>
        No source maps found — bundles are not exposing source.
      </div>
    )
  }

  const activeMap = sourceMaps[activeMapIdx]
  const allFiles = activeMap.files
  const tree = useMemo(() => buildTree(allFiles), [allFiles])

  const filteredFiles = useMemo(() => {
    if (!treeSearch) return allFiles
    return allFiles.filter(f => f.path.toLowerCase().includes(treeSearch.toLowerCase()))
  }, [allFiles, treeSearch])

  const activeFile = openTabs.find(f => f.path === activeTabPath) || null

  const openFile = useCallback((file) => {
    setOpenTabs(prev => prev.find(f => f.path === file.path) ? prev : [...prev, file])
    setActiveTabPath(file.path)
    setJumpToLine(null)
  }, [])

  const closeTab = useCallback((path, e) => {
    e.stopPropagation()
    setOpenTabs(prev => {
      const next = prev.filter(f => f.path !== path)
      if (activeTabPath === path) setActiveTabPath(next.length ? next[next.length - 1].path : null)
      return next
    })
  }, [activeTabPath])

  const jumpTo = useCallback((fileOrPath, line) => {
    const file = typeof fileOrPath === 'string' ? allFiles.find(f => f.path === fileOrPath) : fileOrPath
    if (!file) return
    openFile(file)
    setSidebarPanel('explorer')
    setTimeout(() => setJumpToLine(line), 50)
  }, [allFiles, openFile])

  const pentestHitCount = useMemo(() => {
    const results = runPentest(allFiles.filter(f => f.has_content))
    return results.reduce((a, r) => a + r.hits.length, 0)
  }, [allFiles])

  /* -- status bar info -- */
  const lineCount = activeFile?.content?.split('\n').length || 0
  const charCount = activeFile?.content?.length || 0

  return (
    <div
      className="flex flex-col rounded overflow-hidden select-none"
      style={{ border: '1px solid var(--border-bright)', background: 'var(--bg)', height: 'min(75vh, 640px)', minHeight: 420 }}
    >
      {/* ── Map selector bar ─────────────────── */}
      {sourceMaps.length > 1 && (
        <div className="flex items-center gap-1 px-3 py-1.5 shrink-0" style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
          <span className="text-xs mr-2" style={{ color: 'var(--muted)' }}>bundle:</span>
          {sourceMaps.map((sm, i) => (
            <button key={i} onClick={() => { setActiveMapIdx(i); setOpenTabs([]); setActiveTabPath(null) }}
              className="text-xs px-2 py-0.5 rounded transition-colors"
              style={{ background: i === activeMapIdx ? 'rgba(0,255,136,0.1)' : 'transparent', color: i === activeMapIdx ? 'var(--green)' : 'var(--muted)', border: `1px solid ${i === activeMapIdx ? 'rgba(0,255,136,0.2)' : 'var(--border)'}` }}>
              {sm.map_url.split('/').pop() || `bundle ${i + 1}`}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2 text-xs">
            <span style={{ color: activeMap.exposure === 'full_source' ? 'var(--red)' : 'var(--amber)', fontWeight: 600 }}>
              {activeMap.exposure === 'full_source' ? '⚠ FULL SOURCE' : '◑ PATHS ONLY'}
            </span>
            <span style={{ color: 'var(--muted)' }}>{activeMap.file_count} files</span>
          </div>
        </div>
      )}

      {/* ── Main body: activity bar + sidebar + editor ─ */}
      <div className="flex flex-1 overflow-hidden">

        {/* Activity bar */}
        <div className="flex flex-col items-center py-2 gap-1 shrink-0" style={{ width: 44, background: 'var(--surface-2)', borderRight: '1px solid var(--border)' }}>
          {[
            { id: 'explorer', icon: '🗂️', title: 'File Explorer' },
            { id: 'search', icon: '🔍', title: 'Search Files' },
            { id: 'pentest', icon: '🛡️', title: 'Pentest Findings', badge: pentestHitCount },
          ].map(({ id, icon, title, badge }) => (
            <button
              key={id}
              title={title}
              onClick={() => { if (sidebarPanel === id && sidebarOpen) setSidebarOpen(false); else { setSidebarPanel(id); setSidebarOpen(true) } }}
              className="w-9 h-9 flex items-center justify-center rounded relative transition-colors"
              style={{ background: sidebarPanel === id && sidebarOpen ? 'rgba(255,255,255,0.06)' : 'transparent', borderLeft: sidebarPanel === id && sidebarOpen ? '2px solid var(--green)' : '2px solid transparent' }}
            >
              <span style={{ fontSize: 16 }}>{icon}</span>
              {badge > 0 && (
                <span className="absolute top-0.5 right-0.5 text-xs rounded-full px-1" style={{ background: 'var(--red)', color: '#fff', fontSize: 8, lineHeight: '14px', minWidth: 14, textAlign: 'center' }}>{badge > 99 ? '99+' : badge}</span>
              )}
            </button>
          ))}
        </div>

        {/* Sidebar */}
        <AnimatePresence initial={false}>
          {sidebarOpen && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 220, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="flex flex-col overflow-hidden shrink-0"
              style={{ background: 'var(--surface-2)', borderRight: '1px solid var(--border)' }}
            >
              {/* Sidebar header */}
              <div className="flex items-center justify-between px-3 py-1.5 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
                <span className="text-xs uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
                  {sidebarPanel === 'explorer' ? 'Explorer' : sidebarPanel === 'search' ? 'Search' : 'Pentest'}
                </span>
                {sidebarPanel === 'explorer' && (
                  <span className="text-xs" style={{ color: 'var(--muted)' }}>{allFiles.length} files</span>
                )}
              </div>

              {sidebarPanel === 'explorer' && (
                <div className="flex flex-col flex-1 overflow-hidden">
                  {/* File filter */}
                  <div className="px-2 py-1 shrink-0">
                    <input
                      value={treeSearch}
                      onChange={e => setTreeSearch(e.target.value)}
                      placeholder="Filter files..."
                      className="w-full bg-transparent text-xs px-2 py-1 rounded outline-none"
                      style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', caretColor: 'var(--green)' }}
                    />
                  </div>
                  <div className="flex-1 overflow-y-auto py-1">
                    {treeSearch ? (
                      filteredFiles.map(file => (
                        <button key={file.path} onClick={() => openFile(file)}
                          className="w-full flex items-center gap-1.5 px-2 py-0.5 text-xs text-left hover:bg-white/5"
                          style={{ color: file.path === activeTabPath ? 'var(--green)' : file.has_content ? 'var(--text)' : 'var(--muted)' }}>
                          <FileIcon lang={file.lang} />
                          <span className="truncate">{file.path.split('/').pop()}</span>
                        </button>
                      ))
                    ) : (
                      Object.entries(tree)
                        .sort(([, a], [, b]) => a.__dir && !b.__dir ? -1 : !a.__dir && b.__dir ? 1 : 0)
                        .map(([name, node]) => (
                          <TreeNode key={name} name={name} node={node} depth={0}
                            onSelect={openFile} openPaths={openFolders} setOpenPaths={setOpenFolders}
                            activePath={activeTabPath} />
                        ))
                    )}
                  </div>
                </div>
              )}

              {sidebarPanel === 'search' && (
                <div className="flex-1 overflow-hidden">
                  <SearchPanel files={allFiles} onJumpTo={jumpTo} />
                </div>
              )}

              {sidebarPanel === 'pentest' && (
                <div className="flex-1 overflow-hidden">
                  <PentestPanel files={allFiles} onJumpTo={jumpTo} />
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Editor area */}
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Tab bar */}
          <div className="flex overflow-x-auto shrink-0" style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', scrollbarWidth: 'none' }}>
            {openTabs.map(file => {
              const isActive = file.path === activeTabPath
              return (
                <button
                  key={file.path}
                  onClick={() => setActiveTabPath(file.path)}
                  className="flex items-center gap-2 px-3 py-1.5 shrink-0 text-xs border-r whitespace-nowrap group"
                  style={{ borderColor: 'var(--border)', borderTop: isActive ? '1px solid var(--green)' : '1px solid transparent', background: isActive ? 'var(--bg)' : 'var(--surface)', color: isActive ? 'var(--text)' : 'var(--text-dim)' }}
                >
                  <FileIcon lang={file.lang} size="sm" />
                  <span className="max-w-32 truncate">{file.path.split('/').pop()}</span>
                  <span
                    onClick={e => closeTab(file.path, e)}
                    className="opacity-0 group-hover:opacity-100 hover:text-white transition-opacity ml-1 leading-none"
                    style={{ color: 'var(--muted)', fontSize: 14 }}
                  >×</span>
                </button>
              )
            })}
            {openTabs.length === 0 && (
              <div className="px-3 py-1.5 text-xs" style={{ color: 'var(--border-bright)' }}>
                No files open — select from explorer
              </div>
            )}
          </div>

          {/* Breadcrumb */}
          {activeFile && (
            <div className="flex items-center gap-1 px-3 py-1 shrink-0 overflow-x-auto" style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', scrollbarWidth: 'none' }}>
              {activeFile.path.split('/').map((part, i, arr) => (
                <span key={i} className="flex items-center gap-1 text-xs shrink-0">
                  {i > 0 && <span style={{ color: 'var(--border-bright)' }}>›</span>}
                  <span style={{ color: i === arr.length - 1 ? 'var(--text)' : 'var(--muted)' }}>{part}</span>
                </span>
              ))}
            </div>
          )}

          {/* Code view */}
          <div className="flex-1 overflow-hidden">
            <CodeEditor file={activeFile} jumpToLine={jumpToLine} />
          </div>
        </div>
      </div>

      {/* ── Status bar ────────────────────────────── */}
      <div
        className="flex items-center justify-between px-3 shrink-0 text-xs"
        style={{ background: activeMap.exposure === 'full_source' ? 'rgba(255,68,85,0.15)' : 'rgba(255,184,0,0.12)', borderTop: '1px solid var(--border)', height: 22, color: 'var(--text-dim)' }}
      >
        <div className="flex items-center gap-3">
          <span style={{ color: activeMap.exposure === 'full_source' ? 'var(--red)' : 'var(--amber)', fontWeight: 600 }}>
            {activeMap.exposure === 'full_source' ? '⚠ FULL SOURCE EXPOSED' : '◑ PATHS ONLY'}
          </span>
          {activeFile && <span>{activeFile.lang}</span>}
        </div>
        {activeFile?.has_content && (
          <div className="flex items-center gap-3">
            <span>{lineCount} lines</span>
            <span>{(charCount / 1024).toFixed(1)}kb</span>
            <span style={{ color: LANG_COLORS[activeFile.lang] || 'var(--muted)' }}>{LANG_LABELS[activeFile.lang]}</span>
          </div>
        )}
      </div>
    </div>
  )
}
