import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { HEROES, type Hero } from './data/heroes'

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_GUESSES = 6
const STORAGE_KEY = 'herodle_state'
const STATS_KEY = 'herodle_stats'

// ─── Types ────────────────────────────────────────────────────────────────────

type CategoryResult = 'correct' | 'incorrect'
type YearResult = 'correct' | 'earlier' | 'later'

interface GuessEval {
  hero: Hero
  universe: CategoryResult
  species: CategoryResult
  alignment: CategoryResult
  ethnicity: CategoryResult
  year: YearResult
}

interface GameState {
  date: string
  guessIds: string[]
  status: 'playing' | 'won' | 'lost'
}

interface Stats {
  gamesPlayed: number
  wins: number
  currentStreak: number
  maxStreak: number
  lastWonDate: string
  lastPlayedDate: string
}

// ─── Game Logic ───────────────────────────────────────────────────────────────

function getUtcDateString(): string {
  const n = new Date()
  return `${n.getUTCFullYear()}-${String(n.getUTCMonth() + 1).padStart(2, '0')}-${String(n.getUTCDate()).padStart(2, '0')}`
}

function getDailyIndex(): number {
  const n = new Date()

  const day = Math.floor(
    new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime() / 86_400_000
  )

  return day % HEROES.length

}

function getDailyNumber(): number {
  const n = new Date()
const origin = Date.UTC(
  n.getUTCFullYear(),
  n.getUTCMonth(),
  n.getUTCDate()
)
const ms = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate())
  return Math.floor((ms - origin) / 86_400_000) + 1
}

function evaluateGuess(guess: Hero, target: Hero): GuessEval {
  let year: YearResult
  if (guess.firstAppearanceYear === target.firstAppearanceYear) year = 'correct'
  else if (guess.firstAppearanceYear > target.firstAppearanceYear) year = 'earlier'
  else year = 'later'
  return {
    hero: guess,
    universe: guess.universe === target.universe ? 'correct' : 'incorrect',
    species: guess.species === target.species ? 'correct' : 'incorrect',
    alignment: guess.alignment === target.alignment ? 'correct' : 'incorrect',
    ethnicity: guess.ethnicity === target.ethnicity ? 'correct' : 'incorrect',
    year,
  }
}

// ─── Storage ──────────────────────────────────────────────────────────────────

function loadGameState(): GameState | null {
  try {
    const d = localStorage.getItem(STORAGE_KEY)
    return d ? (JSON.parse(d) as GameState) : null
  } catch { return null }
}

function saveGameState(s: GameState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
}

function loadStats(): Stats {
  try {
    const d = localStorage.getItem(STATS_KEY)
    return d ? (JSON.parse(d) as Stats) : defaultStats()
  } catch { return defaultStats() }
}

function defaultStats(): Stats {
  return { gamesPlayed: 0, wins: 0, currentStreak: 0, maxStreak: 0, lastWonDate: '', lastPlayedDate: '' }
}

function saveStats(s: Stats) {
  localStorage.setItem(STATS_KEY, JSON.stringify(s))
}

// ─── Share ────────────────────────────────────────────────────────────────────

function buildShareText(evals: GuessEval[], won: boolean): string {
  const num = getDailyNumber()
  const result = won ? `${evals.length}/6` : 'X/6'
  const rows = evals.map(e => {
    const u = e.universe === 'correct' ? '🟩' : '🟥'
    const s = e.species === 'correct' ? '🟩' : '🟥'
    const a = e.alignment === 'correct' ? '🟩' : '🟥'
    const eth = e.ethnicity === 'correct' ? '🟩' : '🟥'
    const y = e.year === 'correct' ? '🟩' : e.year === 'earlier' ? '⬆️' : '⬇️'
    return `${u}${s}${a}${eth}${y}`
  })
  return [`HERODLE #${num} ${result}`, '', ...rows, '', 'Play at herodle.game'].join('\n')
}

// ─── Avatar helpers ───────────────────────────────────────────────────────────

const PALETTE = ['#4F8EF7', '#F59E0B', '#EC4899', '#10B981', '#6366F1', '#EF4444', '#14B8A6', '#F97316']

function avatarColor(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffff
  return PALETTE[h % PALETTE.length]
}

function initials(name: string): string {
  return name.split(/\s+/).map(w => w[0] ?? '').join('').slice(0, 2).toUpperCase()
}

// ─── HeroAvatar ───────────────────────────────────────────────────────────────

function HeroAvatar({ hero, size = 36 }: { hero: Hero; size?: number }) {
  return (
    <div
      className="flex items-center justify-center rounded-full font-display font-bold text-white shrink-0 select-none"
      style={{
        width: size,
        height: size,
        backgroundColor: avatarColor(hero.id),
        fontSize: size * 0.34,
        letterSpacing: '-0.02em',
      }}
    >
      {initials(hero.name)}
    </div>
  )
}

// ─── GuessCell ────────────────────────────────────────────────────────────────

const CELL_STYLES: Record<CategoryResult | YearResult, { bg: string; textClass: string }> = {
  correct: { bg: '#22C55E', textClass: 'text-white' },
  incorrect: { bg: '#EF4444', textClass: 'text-white' },
  earlier: { bg: '#4F8EF7', textClass: 'text-white' },
  later: { bg: '#F59E0B', textClass: 'text-white' },
}

function GuessCell({
  value,
  result,
  delay,
}: {
  value: string
  result: CategoryResult | YearResult
  delay: number
}) {
  const { bg, textClass } = CELL_STYLES[result]
  const yearArrow = result === 'earlier' ? '↑' : result === 'later' ? '↓' : null

  return (
    <motion.div
      className={`flex flex-col items-center justify-center rounded-lg px-1.5 py-2 min-w-[80px] h-[58px] gap-0.5 ${textClass}`}
      style={{ backgroundColor: bg, transformOrigin: 'center' }}
      initial={{ scaleY: 0.2, opacity: 0 }}
      animate={{ scaleY: 1, opacity: 1 }}
      transition={{ delay, duration: 0.35, ease: [0.34, 1.56, 0.64, 1] }}
    >
      <span className="text-[11px] font-semibold leading-tight text-center truncate max-w-full px-1 opacity-95">
        {value}
      </span>
      {yearArrow && (
        <span className="text-base font-bold leading-none">{yearArrow}</span>
      )}
      {result === 'correct' && (
        <span className="text-xs leading-none opacity-80">✓</span>
      )}
      {result === 'incorrect' && (
        <span className="text-xs leading-none opacity-80">✗</span>
      )}
    </motion.div>
  )
}

// ─── GuessRow ─────────────────────────────────────────────────────────────────

function GuessRow({ eval: ev, rowIndex }: { eval: GuessEval; rowIndex: number }) {
  const base = rowIndex * 0.05
  return (
    <motion.div
      className="flex gap-2 items-center"
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      {/* Hero name column */}
      <div className="flex items-center gap-2 min-w-[130px] w-[130px] shrink-0">
        <HeroAvatar hero={ev.hero} size={32} />
        <span className="text-sm font-medium text-white truncate leading-tight">{ev.hero.name}</span>
      </div>

      {/* Category cells */}
      <div className="flex gap-2 overflow-x-auto">
        <GuessCell value={ev.hero.universe} result={ev.universe} delay={base + 0.05} />
        <GuessCell value={ev.hero.species} result={ev.species} delay={base + 0.10} />
        <GuessCell value={ev.hero.alignment} result={ev.alignment} delay={base + 0.15} />
        <GuessCell value={ev.hero.ethnicity} result={ev.ethnicity} delay={base + 0.20} />
        <GuessCell value={String(ev.hero.firstAppearanceYear)} result={ev.year} delay={base + 0.25} />
      </div>
    </motion.div>
  )
}

// ─── TableHeaders ─────────────────────────────────────────────────────────────

function TableHeaders() {
  const cols = ['Universe', 'Species', 'Alignment', 'Ethnicity', 'First Appeared']
  return (
    <div className="flex gap-2 items-center mb-2">
      <div className="min-w-[130px] w-[130px] shrink-0" />
      <div className="flex gap-2">
        {cols.map(c => (
          <div
            key={c}
            className="min-w-[80px] text-center text-[10px] font-semibold uppercase tracking-wider text-muted"
          >
            {c}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── AttemptDots ──────────────────────────────────────────────────────────────

function AttemptDots({ used, max }: { used: number; max: number }) {
  return (
    <div className="flex items-center gap-1.5 justify-center">
      {Array.from({ length: max }, (_, i) => (
        <div
          key={i}
          className="rounded-full transition-all duration-300"
          style={{
            width: 8,
            height: 8,
            backgroundColor: i < used ? '#4F8EF7' : '#2D2D2D',
            boxShadow: i < used ? '0 0 6px rgba(79,142,247,0.5)' : 'none',
          }}
        />
      ))}
    </div>
  )
}

// ─── SearchBar ────────────────────────────────────────────────────────────────

function SearchBar({
  guesses,
  onGuess,
  disabled,
}: {
  guesses: GuessEval[]
  onGuess: (hero: Hero) => void
  disabled: boolean
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [selectedIdx, setSelectedIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const guessedIds = useMemo(() => new Set(guesses.map(g => g.hero.id)), [guesses])

  const filtered = useMemo(() => {
    if (!query.trim()) return []
    const q = query.toLowerCase()
    return HEROES.filter(h => h.name.toLowerCase().includes(q)).slice(0, 8)
  }, [query])

  useEffect(() => {
    setSelectedIdx(0)
  }, [filtered])

  const selectHero = useCallback(
    (hero: Hero) => {
      if (guessedIds.has(hero.id)) return
      onGuess(hero)
      setQuery('')
      setOpen(false)
    },
    [guessedIds, onGuess],
  )

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open || filtered.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIdx(i => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const hero = filtered[selectedIdx]
      if (hero) selectHero(hero)
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function highlight(text: string, q: string) {
    if (!q) return <span>{text}</span>
    const idx = text.toLowerCase().indexOf(q.toLowerCase())
    if (idx === -1) return <span>{text}</span>
    return (
      <span>
        {text.slice(0, idx)}
        <mark className="bg-primary/30 text-primary font-semibold rounded-sm px-px">{text.slice(idx, idx + q.length)}</mark>
        {text.slice(idx + q.length)}
      </span>
    )
  }

  const universeBadgeColor: Record<string, string> = {
    Marvel: '#EF4444',
    DC: '#4F8EF7',
    Image: '#F59E0B',
    'Dark Horse': '#F97316',
    Valiant: '#10B981',
  }

  return (
    <div ref={containerRef} className="relative w-full max-w-lg mx-auto">
      <div
        className="flex items-center gap-3 rounded-xl px-4 py-3.5 border transition-all duration-200"
        style={{
          backgroundColor: '#252525',
          borderColor: open && filtered.length > 0 ? '#4F8EF7' : '#2D2D2D',
          boxShadow: open && filtered.length > 0 ? '0 0 0 2px rgba(79,142,247,0.2)' : 'none',
        }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#9CA3AF"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => query && setOpen(true)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={disabled ? 'Game over' : 'Search for a superhero…'}
          className="flex-1 bg-transparent text-white text-sm font-medium placeholder:text-muted outline-none disabled:opacity-40 disabled:cursor-not-allowed"
          autoComplete="off"
          aria-label="Search for a superhero"
          aria-expanded={open}
          aria-autocomplete="list"
        />
      </div>

      <AnimatePresence>
        {open && filtered.length > 0 && (
          <motion.div
            className="absolute z-50 w-full mt-2 rounded-xl overflow-hidden border shadow-2xl"
            style={{ backgroundColor: '#1E1E1E', borderColor: '#2D2D2D' }}
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            role="listbox"
          >
            {filtered.map((hero, i) => {
              const alreadyGuessed = guessedIds.has(hero.id)
              return (
                <button
                  key={hero.id}
                  role="option"
                  aria-selected={i === selectedIdx}
                  disabled={alreadyGuessed}
                  onClick={() => selectHero(hero)}
                  onMouseEnter={() => setSelectedIdx(i)}
                  className="flex items-center gap-3 w-full px-4 py-3 text-left transition-colors duration-100 disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{
                    backgroundColor: i === selectedIdx && !alreadyGuessed ? '#2A2A2A' : 'transparent',
                  }}
                >
                  <HeroAvatar hero={hero} size={28} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white truncate">
                      {highlight(hero.name, query)}
                    </div>
                    {alreadyGuessed && (
                      <div className="text-[10px] text-muted mt-0.5">Already guessed</div>
                    )}
                  </div>
                  <span
                    className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
                    style={{
                      backgroundColor: `${universeBadgeColor[hero.universe] ?? '#9CA3AF'}22`,
                      color: universeBadgeColor[hero.universe] ?? '#9CA3AF',
                    }}
                  >
                    {hero.universe}
                  </span>
                </button>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── StatCard ─────────────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col items-center gap-1 px-4 py-3 rounded-xl" style={{ backgroundColor: '#252525' }}>
      <span className="text-2xl font-display font-bold text-white">{value}</span>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted text-center leading-tight">
        {label}
      </span>
    </div>
  )
}

// ─── StatsGrid ────────────────────────────────────────────────────────────────

function StatsGrid({ stats }: { stats: Stats }) {
  const winPct = stats.gamesPlayed > 0 ? Math.round((stats.wins / stats.gamesPlayed) * 100) : 0
  return (
    <div className="grid grid-cols-4 gap-2 w-full">
      <StatCard label="Played" value={stats.gamesPlayed} />
      <StatCard label="Win %" value={`${winPct}%`} />
      <StatCard label="Streak" value={stats.currentStreak} />
      <StatCard label="Best" value={stats.maxStreak} />
    </div>
  )
}

// ─── Modals ───────────────────────────────────────────────────────────────────

const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
}

const modalVariants = {
  hidden: { scale: 0.85, opacity: 0, y: 20 },
  visible: { scale: 1, opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 300, damping: 24 } },
  exit: { scale: 0.9, opacity: 0, y: 10, transition: { duration: 0.18 } },
}

function ModalShell({
  children,
  onClose,
}: {
  children: React.ReactNode
  onClose?: () => void
}) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
      variants={overlayVariants}
      initial="hidden"
      animate="visible"
      exit="hidden"
      transition={{ duration: 0.2 }}
      onClick={onClose}
    >
      <motion.div
        className="relative w-full max-w-sm rounded-2xl border p-6 shadow-2xl"
        style={{ backgroundColor: '#1E1E1E', borderColor: '#2D2D2D' }}
        variants={modalVariants}
        onClick={e => e.stopPropagation()}
      >
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-muted hover:text-white transition-colors"
            aria-label="Close"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        )}
        {children}
      </motion.div>
    </motion.div>
  )
}

function WinModal({
  guesses,
  target,
  stats,
  onClose,
}: {
  guesses: GuessEval[]
  target: Hero
  stats: Stats
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)
  const dailyNum = getDailyNumber()

  const handleShare = async () => {
    const text = buildShareText(guesses, true)
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      console.error('Clipboard write failed')
    }
  }

  return (
    <ModalShell onClose={onClose}>
      <div className="flex flex-col items-center gap-5 text-center">
        <div className="flex flex-col items-center gap-2">
          <div className="text-4xl">🎉</div>
          <h2 className="text-xl font-display font-bold text-white">You got it!</h2>
          <p className="text-sm text-muted">
            Guessed in <span className="text-white font-semibold">{guesses.length}</span> out of {MAX_GUESSES} tries
          </p>
        </div>

        <div
          className="flex items-center gap-3 w-full rounded-xl p-3 border"
          style={{ backgroundColor: '#252525', borderColor: '#2D2D2D' }}
        >
          <HeroAvatar hero={target} size={44} />
          <div className="text-left">
            <div className="font-display font-bold text-white text-base">{target.name}</div>
            <div className="text-xs text-muted mt-0.5">
              {target.universe} · {target.species} · {target.firstAppearanceYear}
            </div>
          </div>
        </div>

        <StatsGrid stats={stats} />

        <button
          onClick={handleShare}
          className="w-full py-3 rounded-xl font-display font-semibold text-sm text-white transition-all duration-200 active:scale-95"
          style={{
            backgroundColor: copied ? '#22C55E' : '#4F8EF7',
          }}
        >
          {copied ? '✓ Copied to clipboard!' : '📋 Share Results'}
        </button>

        <p className="text-[11px] text-muted">Next hero in <NextReset /></p>
      </div>
    </ModalShell>
  )
}

function LoseModal({
  guesses,
  target,
  stats,
  onClose,
}: {
  guesses: GuessEval[]
  target: Hero
  stats: Stats
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)

  const handleShare = async () => {
    const text = buildShareText(guesses, false)
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      console.error('Clipboard write failed')
    }
  }

  return (
    <ModalShell onClose={onClose}>
      <div className="flex flex-col items-center gap-5 text-center">
        <div className="flex flex-col items-center gap-2">
          <div className="text-4xl">💔</div>
          <h2 className="text-xl font-display font-bold text-white">Better luck tomorrow</h2>
          <p className="text-sm text-muted">The hero was…</p>
        </div>

        <div
          className="flex items-center gap-3 w-full rounded-xl p-3 border"
          style={{ backgroundColor: '#252525', borderColor: '#2D2D2D' }}
        >
          <HeroAvatar hero={target} size={44} />
          <div className="text-left">
            <div className="font-display font-bold text-white text-base">{target.name}</div>
            <div className="text-xs text-muted mt-0.5">
              {target.universe} · {target.species} · {target.firstAppearanceYear}
            </div>
          </div>
        </div>

        <StatsGrid stats={stats} />

        <button
          onClick={handleShare}
          className="w-full py-3 rounded-xl font-display font-semibold text-sm text-white transition-all duration-200 active:scale-95"
          style={{
            backgroundColor: copied ? '#22C55E' : '#4F8EF7',
          }}
        >
          {copied ? '✓ Copied to clipboard!' : '📋 Share Results'}
        </button>

        <p className="text-[11px] text-muted">Next hero in <NextReset /></p>
      </div>
    </ModalShell>
  )
}

function StatsModal({ stats, onClose }: { stats: Stats; onClose: () => void }) {
  return (
    <ModalShell onClose={onClose}>
      <div className="flex flex-col items-center gap-5">
        <h2 className="text-lg font-display font-bold text-white">Statistics</h2>
        <StatsGrid stats={stats} />
        <div className="w-full h-px" style={{ backgroundColor: '#2D2D2D' }} />
        <div className="text-center">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-1">Next Hero</div>
          <div className="text-xl font-display font-bold text-white">
            <NextReset />
          </div>
        </div>
      </div>
    </ModalShell>
  )
}

// ─── NextReset ────────────────────────────────────────────────────────────────

function NextReset() {
  const [timeLeft, setTimeLeft] = useState('')

  useEffect(() => {
    function update() {
      const now = new Date()
      const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
      const diff = tomorrow.getTime() - now.getTime()
      const h = Math.floor(diff / 3_600_000)
      const m = Math.floor((diff % 3_600_000) / 60_000)
      const s = Math.floor((diff % 60_000) / 1_000)
      setTimeLeft(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`)
    }
    update()
    const id = setInterval(update, 1_000)
    return () => clearInterval(id)
  }, [])

  return <span className="font-display font-semibold tabular-nums">{timeLeft}</span>
}

// ─── HowToPlay banner ─────────────────────────────────────────────────────────

function HowToPlay() {
  return (
    <div
      className="rounded-xl p-4 border text-sm leading-relaxed"
      style={{ backgroundColor: '#1A1A1A', borderColor: '#2D2D2D' }}
    >
      <p className="font-display font-semibold text-white mb-2">How to play</p>
      <ul className="space-y-1 text-muted text-[13px]">
        <li>🔍 Search for a superhero and select them.</li>
        <li>🟩 Green = exact match &nbsp; 🟥 Red = no match</li>
        <li>↑ Target appeared <strong className="text-white">earlier</strong> &nbsp; ↓ Target appeared <strong className="text-white">later</strong></li>
        <li>You have <strong className="text-white">6 guesses</strong>. A new hero every day at midnight your local time.</li>
      </ul>
    </div>
  )
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const target = useMemo(() => HEROES[getDailyIndex()], [])
  const today = useMemo(() => getUtcDateString(), [])

  const [guesses, setGuesses] = useState<GuessEval[]>([])
  const [status, setStatus] = useState<'playing' | 'won' | 'lost'>('playing')
  const [stats, setStats] = useState<Stats>(loadStats)
  const [modal, setModal] = useState<'none' | 'win' | 'lose' | 'stats'>('none')

  // Hydrate from localStorage
  useEffect(() => {
    const saved = loadGameState()
    if (saved && saved.date === today) {
      const evals: GuessEval[] = saved.guessIds
        .map(id => HEROES.find(h => h.id === id))
        .filter(Boolean)
        .map(h => evaluateGuess(h!, target))
      setGuesses(evals)
      setStatus(saved.status)
      if (saved.status !== 'playing') {
        setTimeout(() => setModal(saved.status === 'won' ? 'win' : 'lose'), 600)
      }
    }
  }, [])

  const handleGuess = useCallback(
    (hero: Hero) => {
      if (status !== 'playing') return
      if (guesses.some(g => g.hero.id === hero.id)) return

      const ev = evaluateGuess(hero, target)
      const nextGuesses = [...guesses, ev]
      setGuesses(nextGuesses)

      let nextStatus: GameState['status'] = 'playing'
      if (hero.id === target.id) {
        nextStatus = 'won'
        const nextStats = updateStats(stats, today, true)
        setStats(nextStats)
        saveStats(nextStats)
        setTimeout(() => setModal('win'), 700)
      } else if (nextGuesses.length >= MAX_GUESSES) {
        nextStatus = 'lost'
        const nextStats = updateStats(stats, today, false)
        setStats(nextStats)
        saveStats(nextStats)
        setTimeout(() => setModal('lose'), 700)
      }

      setStatus(nextStatus)
      saveGameState({ date: today, guessIds: nextGuesses.map(g => g.hero.id), status: nextStatus })
    },
    [guesses, status, target, stats, today],
  )

  const dailyNum = getDailyNumber()

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: '#121212', fontFamily: "'Inter', sans-serif" }}
    >
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-4 max-w-2xl mx-auto w-full">
        <div />
        <div className="flex flex-col items-center">
          <h1
            className="text-2xl sm:text-3xl font-display font-black tracking-tight text-white"
            style={{ letterSpacing: '-0.04em' }}
          >
            HERODLE
          </h1>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted mt-0.5">
            Daily Hero · #{dailyNum}
          </p>
        </div>
        <button
          onClick={() => setModal('stats')}
          className="p-2 rounded-lg transition-colors hover:bg-white/10 text-muted hover:text-white"
          aria-label="Statistics"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 3v18h18" />
            <path d="M18 17V9" />
            <path d="M13 17V5" />
            <path d="M8 17v-3" />
          </svg>
        </button>
      </header>

      {/* Divider */}
      <div className="h-px w-full" style={{ backgroundColor: '#2D2D2D' }} />

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center px-4 py-6 gap-6 max-w-2xl mx-auto w-full">
        {/* Attempt tracker */}
        <AttemptDots used={guesses.length} max={MAX_GUESSES} />

        {/* Search — hidden when game is over */}
        {status === 'playing' && (
          <SearchBar guesses={guesses} onGuess={handleGuess} disabled={false} />
        )}

        {/* Already played banner */}
        <AnimatePresence>
          {status !== 'playing' && (
            <motion.div
              className="w-full max-w-lg mx-auto rounded-2xl border p-5 flex flex-col gap-4"
              style={{ backgroundColor: '#1A1A1A', borderColor: '#2D2D2D' }}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{status === 'won' ? '🎉' : '💔'}</span>
                <div>
                  <p className="font-display font-bold text-white text-base leading-tight">
                    {status === 'won' ? "Today's hero found!" : "Better luck tomorrow"}
                  </p>
                  <p className="text-xs text-muted mt-0.5">
                    Come back at midnight for a new hero
                  </p>
                </div>
              </div>

              {/* Revealed answer */}
              <div
                className="flex items-center gap-3 rounded-xl p-3 border"
                style={{ backgroundColor: '#252525', borderColor: '#2D2D2D' }}
              >
                <HeroAvatar hero={target} size={40} />
                <div>
                  <div className="font-display font-bold text-white text-sm">{target.name}</div>
                  <div className="text-[11px] text-muted mt-0.5">
                    {target.universe} · {target.species} · {target.firstAppearanceYear}
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setModal(status === 'won' ? 'win' : 'lose')}
                  className="flex-1 py-2.5 rounded-xl font-display font-semibold text-sm text-white transition-all active:scale-95"
                  style={{ backgroundColor: '#4F8EF7' }}
                >
                  View Stats
                </button>
                <div
                  className="flex items-center gap-1.5 px-4 rounded-xl border text-xs font-semibold tabular-nums"
                  style={{ backgroundColor: '#252525', borderColor: '#2D2D2D', color: '#9CA3AF' }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  <NextReset />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* How to play (before first guess) */}
        <AnimatePresence>
          {guesses.length === 0 && status === 'playing' && (
            <motion.div
              className="w-full"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, height: 0, overflow: 'hidden' }}
              transition={{ duration: 0.3 }}
            >
              <HowToPlay />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Guess table */}
        {guesses.length > 0 && (
          <div className="w-full overflow-x-auto">
            <div className="min-w-[560px]">
              <TableHeaders />
              <div className="flex flex-col gap-2">
                {guesses.map((ev, i) => (
                  <GuessRow key={ev.hero.id} eval={ev} rowIndex={i} />
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="py-4 text-center">
        <p className="text-[11px] text-muted">
          A new hero every day at midnight your local time
        </p>
      </footer>

      {/* Modals */}
      <AnimatePresence>
        {modal === 'win' && (
          <WinModal
            key="win"
            guesses={guesses}
            target={target}
            stats={stats}
            onClose={() => setModal('none')}
          />
        )}
        {modal === 'lose' && (
          <LoseModal
            key="lose"
            guesses={guesses}
            target={target}
            stats={stats}
            onClose={() => setModal('none')}
          />
        )}
        {modal === 'stats' && (
          <StatsModal key="stats" stats={stats} onClose={() => setModal('none')} />
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Stats updater ────────────────────────────────────────────────────────────

function updateStats(prev: Stats, today: string, won: boolean): Stats {
  // Guard: only count each calendar day once
  if (prev.lastPlayedDate === today) return prev

  const yesterday = (() => {
    const d = new Date(today)
    d.setUTCDate(d.getUTCDate() - 1)
    return d.toISOString().split('T')[0]
  })()

  const streakContinues = prev.lastWonDate === yesterday || prev.lastWonDate === today
  const newStreak = won ? (streakContinues ? prev.currentStreak + 1 : 1) : 0

  return {
    gamesPlayed: prev.gamesPlayed + 1,
    wins: won ? prev.wins + 1 : prev.wins,
    currentStreak: newStreak,
    maxStreak: Math.max(prev.maxStreak, newStreak),
    lastWonDate: won ? today : prev.lastWonDate,
    lastPlayedDate: today,
  }
}
