'use client'

import { useEffect, useState, useMemo } from 'react'
import Header from '@/components/layout/header'
import BottomNav from '@/components/layout/bottom-nav'

interface WikiArticle {
 id: string
 title: string
 category: string
 summary: string
 imageUrl: string
 updatedAt: string
 backlinks: any[]
 sourceLinkIds: any[]
 createdAt: string
}

const categoryIcons: Record<string, string> = {
 'AI/ML': 'smart_toy',
 'creativity': 'palette',
 'enterprise': 'business',
 'career': 'work',
 'agentic-ai': 'psychology',
 'systems': 'hub',
 'Design': 'design_services',
 'DevOps': 'engineering',
 'general': 'auto_stories',
 'enterprise-agentic': 'corporate_fare',
 'ai-ml': 'smart_toy',
}

const categoryColors: Record<string, string> = {
 'AI/ML': 'bg-blue-500/10 text-blue-400',
 'creativity': 'bg-pink-500/10 text-pink-400',
 'enterprise': 'bg-amber-500/10 text-amber-400',
 'career': 'bg-green-500/10 text-green-400',
 'agentic-ai': 'bg-purple-500/10 text-purple-400',
 'systems': 'bg-cyan-500/10 text-cyan-400',
 'Design': 'bg-rose-500/10 text-rose-400',
 'DevOps': 'bg-indigo-500/10 text-indigo-400',
 'enterprise-agentic': 'bg-amber-500/10 text-amber-400',
}

export default function WikiIndexPage() {
 const [articles, setArticles] = useState<WikiArticle[]>([])
 const [loading, setLoading] = useState(true)
 const [search, setSearch] = useState('')
 const [filter, setFilter] = useState('all')

 useEffect(() => {
 const token = localStorage.getItem('greenplot_token') || ''
 fetch('/api/wiki', {
  headers: token ? { Authorization: `Bearer ${token}` } : {}
 })
  .then(r => r.json())
  .then(data => {
  setArticles(data.articles || [])
  setLoading(false)
  })
  .catch(() => setLoading(false))
 }, [])

 const categories = useMemo(() => {
 const cats = new Set(articles.map(a => a.category))
 return ['all', ...Array.from(cats).sort()]
 }, [articles])

 const filtered = useMemo(() => {
 return articles
  .filter(a => filter === 'all' || a.category === filter)
  .filter(a => {
  if (!search) return true
  const q = search.toLowerCase()
  return a.title.toLowerCase().includes(q) || 
    a.summary.toLowerCase().includes(q) || 
    a.category.toLowerCase().includes(q)
  })
  .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
 }, [articles, filter, search])

 const totalBacklinks = articles.reduce((sum, a) => sum + (a.backlinks?.length || 0), 0)
 const categoryCount = new Set(articles.map(a => a.category)).size

 if (loading) {
 return (
  <div className="h-screen flex flex-col bg-background">
  <Header />
  <main className="flex-1 overflow-y-auto">
   <div className="h-8 bg-surface-container rounded-xl w-48 animate-pulse" />
   {[1, 2, 3].map(i => (
   <div key={i} className="h-20 bg-surface-container rounded-2xl animate-pulse" />
   ))}
  </main>
  <BottomNav />
  </div>
 )
 }

 return (
 <div className="h-screen flex flex-col bg-background">
  <Header />
  <main className="flex-1 overflow-y-auto">
  {/* Hero */}
  <section className="">
   <div className="flex items-center justify-between ">
   <div>
    <h1 className="text-3xl font-extrabold tracking-tight text-on-surface">
    Wiki <span className="text-primary">Index</span>
    </h1>
    <p className="text-sm text-on-surface-variant mt-1">
    Complete catalog of {articles.length} articles across {categoryCount} categories
    </p>
   </div>
   </div>
  </section>

  {/* Stats */}
  <div className="flex items-center gap-3 ">
   <div className="flex items-center gap-1.5 text-xs text-on-surface-variant/60">
   <span className="material-symbols-outlined text-sm" >auto_stories</span>
   {articles.length} articles
   </div>
   <div className="flex items-center gap-1.5 text-xs text-on-surface-variant/60">
   <span className="material-symbols-outlined text-sm" >folder</span>
   {categoryCount} categories
   </div>
   <div className="flex items-center gap-1.5 text-xs text-on-surface-variant/60">
   <span className="material-symbols-outlined text-sm" >link</span>
   {totalBacklinks} connections
   </div>
  </div>

  {/* Search */}
  <div className="flex-1 relative ">
   <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/40 text-lg">search</span>
   <input
   value={search}
   onChange={e => setSearch(e.target.value)}
   placeholder="Search wiki articles..."
   className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-surface-container border border-outline-variant/10 text-sm text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary/30 transition-colors"
   />
  </div>

  {/* Category Pills */}
  <div className="flex overflow-x-auto hide-scrollbar gap-2 ">
   {categories.map(cat => (
   <button
    key={cat}
    onClick={() => setFilter(cat)}
    className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
    filter === cat
     ? 'bg-primary text-on-primary'
     : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
    }`}
   >
    {cat === 'all' ? `All (${articles.length})` : `${cat.charAt(0).toUpperCase() + cat.slice(1)}`}
   </button>
   ))}
  </div>

  {/* Articles List */}
  <div className="space-y-2">
   {filtered.length === 0 && (
   <div className="text-center py-12 text-on-surface-variant/40">
    <span className="material-symbols-outlined text-4xl ">search_off</span>
    <p>No articles found</p>
   </div>
   )}
   {filtered.map(article => {
   const icon = categoryIcons[article.category] || 'article'
   const colors = categoryColors[article.category] || 'bg-surface-container text-on-surface-variant'
   return (
    <a
    key={article.id}
    href="/wiki"
    className="flex items-center gap-3 p-4 rounded-2xl bg-surface-container-low border border-outline-variant/10 hover:border-primary/20 transition-all group"
    >
    {/* Icon/Image */}
    {article.imageUrl ? (
     <div className="flex-shrink-0 w-12 h-12 rounded-xl overflow-hidden">
     <img src={article.imageUrl} alt={article.title} className="w-full h-full object-cover" />
     </div>
    ) : (
     <div className={`flex-shrink-0 w-10 h-10 rounded-xl ${colors} flex items-center justify-center`}>
     <span className="material-symbols-outlined text-lg" >{icon}</span>
     </div>
    )}
    
    {/* Content */}
    <div className="flex-1 min-w-0">
     <h3 className="text-sm font-bold text-on-surface group-hover:text-primary transition-colors truncate">
     {article.title}
     </h3>
     <div className="flex items-center gap-2 mt-0.5">
     <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md ${colors}`}>
      {article.category}
     </span>
     {article.backlinks?.length > 0 && (
      <span className="text-[10px] text-on-surface-variant/60">
      🔗 {article.backlinks.length}
      </span>
     )}
     <span className="text-[10px] text-on-surface-variant/40">
      {new Date(article.updatedAt).toLocaleDateString()}
     </span>
     </div>
    </div>

    <span className="material-symbols-outlined text-on-surface-variant/20 group-hover:text-primary transition-colors">arrow_forward</span>
    </a>
   )
   })}
  </div>
  </main>
  <BottomNav />
 </div>
 )
}
