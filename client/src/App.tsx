import { useState, useRef, useEffect } from 'react'

// API base: relative /api routes work in both dev (Vite proxy) and prod (Vercel serverless functions)
const API = ''

type Recipe = {
  id: number
  title: string
  image: string
  usedCount: number
  missedCount: number
  missedIngredients: string[]
  usedIngredients: string[]
  matchPercent: number
  readyInMinutes?: number
  servings?: number
  extendedIngredients?: { original: string }[]
}

type Area = 'fridge' | 'freezer' | 'pantry' | 'grocery'

type Photo = {
  id: string
  area: Area
  dataUrl: string
  ingredients: string[]
  analyzing: boolean
  error?: string
}

type Filters = {
  cuisine: string
  diet: string
  maxReadyTime: number
}

type CookHistoryEntry = {
  id: number
  title: string
  image: string
  cookedAt: string
  matchPercent: number
}

const CUISINES = ["Any","Italian","Mexican","Chinese","Indian","American","Japanese","Thai","Mediterranean","French","Korean","Vietnamese"]
const DIETS = ["Any","Vegetarian","Vegan","Gluten Free","Dairy Free","Ketogenic","Paleo","Pescatarian"]
const MAX_TIMES = [
  { label: "Any", value: 0 },
  { label: "15 min", value: 15 },
  { label: "30 min", value: 30 },
  { label: "45 min", value: 45 },
  { label: "60 min", value: 60 },
]

const AREAS: { value: Area; label: string; emoji: string }[] = [
  { value: "fridge", label: "Fridge", emoji: "🧊" },
  { value: "freezer", label: "Freezer", emoji: "❄️" },
  { value: "pantry", label: "Pantry", emoji: "🫙" },
  { value: "grocery", label: "Grocery Haul", emoji: "🛒" },
]

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch { return fallback }
}

function saveToStorage<T>(key: string, value: T) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
}

const LS_SAVED = "fridgeai_saved"
const LS_HISTORY = "fridgeai_history"
const LS_PANTRY = "fridgeai_pantry"
const LS_SHOPPING = "fridgeai_shopping"

export default function App() {
  const [tab, setTab] = useState<"scan" | "cookbook">("scan")
  const [photos, setPhotos] = useState<Photo[]>([])
  const [manualIngredients, setManualIngredients] = useState<string[]>([])
  const [selectedArea, setSelectedArea] = useState<Area>("fridge")
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [allIngredients, setAllIngredients] = useState<string[]>([])
  const [view, setView] = useState<"upload" | "analyzing" | "recipes" | "error">("upload")
  const [error, setError] = useState("")
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null)
  const [recipeDetail, setRecipeDetail] = useState<any>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [filters, setFilters] = useState<Filters>({ cuisine: "", diet: "", maxReadyTime: 0 })
  const [showFilters, setShowFilters] = useState(false)
  const [editingPhotoId, setEditingPhotoId] = useState<string | null>(null)
  const [editText, setEditText] = useState("")
  const [showManualAdd, setShowManualAdd] = useState(false)
  const [manualInput, setManualInput] = useState("")
  const [savedRecipes, setSavedRecipes] = useState<Recipe[]>(() => loadFromStorage(LS_SAVED, [] as Recipe[]))
  const [cookHistory, setCookHistory] = useState<CookHistoryEntry[]>(() => loadFromStorage(LS_HISTORY, [] as CookHistoryEntry[]))
  const [cookbookTab, setCookbookTab] = useState<"saved" | "history" | "plan">("saved")
  const [mealPlan, setMealPlan] = useState<Record<string, any>>({})
  const [planningLoading, setPlanningLoading] = useState(false)
  const [pantryItems, setPantryItems] = useState<PantryItem[]>(() => loadFromStorage(LS_PANTRY, [] as PantryItem[]))
  const [shoppingList, setShoppingList] = useState<ShoppingItem[]>(() => loadFromStorage(LS_SHOPPING, [] as ShoppingItem[]))
  const [selectedForList, setSelectedForList] = useState<Set<number>>(new Set())
  const [showExpiryEditor, setShowExpiryEditor] = useState(false)
  const [expiryEditName, setExpiryEditName] = useState('')
  const [expiryEditDate, setExpiryEditDate] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const manualInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { saveToStorage(LS_SAVED, savedRecipes) }, [savedRecipes])
  useEffect(() => { saveToStorage(LS_HISTORY, cookHistory) }, [cookHistory])
  useEffect(() => { saveToStorage(LS_SHOPPING, shoppingList) }, [shoppingList])
  useEffect(() => { saveToStorage(LS_PANTRY, pantryItems) }, [pantryItems])

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const file = files[0]
    if (!file.type.startsWith("image/")) { setError("Please upload an image file."); setView("error"); return }
    const dataUrl = await fileToDataUrl(file)
    const id = Math.random().toString(36).slice(2)
    const newPhoto: Photo = { id, area: selectedArea, dataUrl, ingredients: [], analyzing: true }
    setPhotos(prev => [...prev, newPhoto])
    analyzePhoto(id, dataUrl)
  }

  const analyzePhoto = async (id: string, dataUrl: string) => {
    try {
      const res = await fetch(`${API}/analyze`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageUrl: dataUrl }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Analysis failed")
      setPhotos(prev => prev.map(p => p.id === id ? { ...p, ingredients: data.ingredients || [], analyzing: false } : p))
    } catch (err: any) { setPhotos(prev => prev.map(p => p.id === id ? { ...p, analyzing: false, error: err.message } : p)) }
  }

  const removePhoto = (id: string) => setPhotos(prev => prev.filter(p => p.id !== id))

  const startEditPhoto = (photo: Photo) => { setEditingPhotoId(photo.id); setEditText(photo.ingredients.join(", ")) }

  const saveEditPhoto = (photoId: string) => {
    setPhotos(prev => prev.map(p => p.id === photoId ? { ...p, ingredients: editText.split(",").map(i => i.trim()).filter(Boolean) } : p))
    setEditingPhotoId(null); setEditText("")
  }

  const addManualIngredient = () => {
    const raw = manualInput.split(",").map(i => i.trim()).filter(Boolean)
    setManualIngredients(prev => [...new Set([...prev, ...raw])])
    setManualInput(""); manualInputRef.current?.focus()
  }

  const removeManualIngredient = (ing: string) => setManualIngredients(prev => prev.filter(i => i !== ing))

  const buildIngredients = () => {
    const fromPhotos = photos.flatMap(p => p.ingredients)
    return [...new Set([...fromPhotos, ...manualIngredients].map(i => i.toLowerCase().trim()))]
  }

  const hasResults = photos.length > 0 && photos.every(p => !p.analyzing)
  const totalIngredients = photos.reduce((sum, p) => sum + p.ingredients.length, 0) + manualIngredients.length

  const findRecipes = async (overrides?: Partial<Filters>) => {
    const unique = buildIngredients()
    if (unique.length === 0) { setError("No ingredients found. Add items manually or try clearer photos."); setView("error"); return }
    setAllIngredients(unique); setView("analyzing"); setShowFilters(false)
    const activeFilters = { ...filters, ...overrides }
    try {
      const res = await fetch(`${API}/recipes`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ingredients: unique,
          cuisine: activeFilters.cuisine || undefined,
          diet: activeFilters.diet || undefined,
          maxReadyTime: activeFilters.maxReadyTime || undefined,
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Recipe search failed")
      setRecipes(data.recipes || []); setView("recipes")
    } catch (err: any) { setError(err.message || "Something went wrong."); setView("error") }
  }

  const clearFilters = () => {
    setFilters({ cuisine: "", diet: "", maxReadyTime: 0 })
    findRecipes({ cuisine: "", diet: "", maxReadyTime: 0 } as Filters)
  }

  const isSaved = (id: number) => savedRecipes.some(r => r.id === id)

  // ── Cooking mode ──
  const [cookingRecipe, setCookingRecipe] = useState<Recipe | null>(null)
  const [cookingStep, setCookingStep] = useState(0)
  const [servingScale, setServingScale] = useState(1)
  const [sheetHydrated, setSheetHydrated] = useState(false)
  const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/1UYWrCptoka69icyReGT7IFSFUaAv23HA6DtqKm_73jQ/export?format=csv&gid=0"

  const parseIngredients = (ings: { original: string }[] | string[], missed: string[]) => {
    if (Array.isArray(ings) && typeof ings[0] === 'object') {
      return (ings as { original: string }[]).map(ing => {
        const raw = ing.original.replace(/½/g, '0.5').replace(/¼/g, '0.25').replace(/¾/g, '0.75')
        const match = raw.match(/^([\d.,\/]+)?\s*([a-zA-Zµµ®°⁰¹²³⁴⁵⁶⁷⁸⁹°]+)?\s+(.+)$/)
        return { qty: match ? parseFloat(match[1]?.replace('/', '.') || '1') : 1, unit: match?.[2] || '', name: match?.[3] || ing.original }
      })
    }
    return (missed as string[]).map(i => ({ qty: 1, unit: '', name: i }))
  }

  const scaleQty = (qty: number) => {
    const scaled = qty * servingScale
    return Number.isInteger(scaled) ? String(scaled) : scaled.toFixed(1).replace(/\.0$/, '')
  }

  const getInstructions = (recipe: Recipe) => {
    if (!recipeDetail?.info?.instructions) return []
    const text = recipeDetail.info.instructions
    // Parse numbered steps
    const steps = text.split(/\n\d+\.\s*/).filter(Boolean).map(s => s.replace(/<[^>]+>/g, '').trim()).filter(s => s.length > 10)
    if (steps.length > 0) return steps
    // Fallback: split by newlines
    return text.split('\n').map(s => s.replace(/<[^>]+>/g, '').trim()).filter(s => s.length > 10)
  }

  const startCooking = (recipe: Recipe) => {
    const ings = parseIngredients(recipeDetail?.info?.extendedIngredients || [], recipe.missedIngredients)
    setPantryItems(prev => {
      const used = new Set(ings.map(i => i.name.toLowerCase()))
      return prev.map(p => used.has(p.name.toLowerCase()) ? { ...p, quantity: String(Math.max(1, (parseInt(p.quantity) || 1) - 1)) } : p)
    })
    setCookingRecipe(recipe); setCookingStep(0); setServingScale(1)
  }

  const speakStep = (text: string) => {
    if ('speechSynthesis' in window) { window.speechSynthesis.cancel(); window.speechSynthesis.speak(new SpeechSynthesisUtterance(text)) }
  }

  const markCooked = (recipe: Recipe, e?: React.MouseEvent) => {
    e?.stopPropagation()
    // Deduct used ingredients from pantry
    const used = new Set(recipe.missedIngredients.map(i => i.toLowerCase()))
    setPantryItems(prev => prev.filter(p => !used.has(p.name.toLowerCase())))
    const entry: CookHistoryEntry = { id: recipe.id, title: recipe.title, image: recipe.image, cookedAt: new Date().toISOString(), matchPercent: recipe.matchPercent }
    setCookHistory(prev => [entry, ...prev.filter(h => h.id !== recipe.id)])
  }

  // Hydrate pantry from Google Sheets on mount
  useEffect(() => {
    fetch(SHEET_CSV_URL).then(r => r.text()).then(csv => {
      const lines = csv.trim().split('\n')
      if (lines.length < 2) return
      const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''))
      const rows = lines.slice(1).map(line => {
        const vals = line.split(',').map(v => v.trim().replace(/"/g, ''))
        return { name: vals[0] || '', addedAt: vals[1] || new Date().toISOString(), expiry: vals[2] || '', quantity: vals[3] || '1' }
      }).filter(r => r.name)
      if (rows.length > 0) setPantryItems(rows)
      setSheetHydrated(true)
    }).catch(() => setSheetHydrated(true))
  }, [])

  const toggleSave = (recipe: Recipe, e?: React.MouseEvent) => {
    e?.stopPropagation()
    if (isSaved(recipe.id)) { setSavedRecipes(prev => prev.filter(r => r.id !== recipe.id)) }
    else { setSavedRecipes(prev => prev.some(r => r.id === recipe.id) ? prev : [...prev, recipe]) }
  }

  const openRecipeDetail = async (recipe: Recipe) => {
    setSelectedRecipe(recipe); setRecipeDetail(null); setLoadingDetail(true)
    try { const res = await fetch(`${API}/recipes/${recipe.id}`); const data = await res.json(); setRecipeDetail(data) }
    catch { setRecipeDetail({ error: "Could not load recipe details" }) }
    finally { setLoadingDetail(false) }
  }

  const openInstacart = (ingredients: string[]) => {
    const query = ingredients.map(i => i.replace(/[^a-zA-Z0-9 ]/g, "").trim()).join(", ")
    window.open(`https://www.instacart.com/store/search?q=${encodeURIComponent(query)}&ref=FridgeAI`, "_blank", "noopener,noreferrer")
  }

  const reset = () => {
    setPhotos([]); setManualIngredients([]); setRecipes([]); setAllIngredients([])
    setView("upload"); setError(""); setSelectedRecipe(null); setRecipeDetail(null)
    setFilters({ cuisine: "", diet: "", maxReadyTime: 0 }); setShowFilters(false)
  }

  const hasActiveFilters = Object.values(filters).some(v => v !== "" && v !== 0)


  const daysUntil = (dateStr: string) => {
    const today = new Date(); today.setHours(0,0,0,0)
    const d = new Date(dateStr); d.setHours(0,0,0,0)
    return Math.round((d.getTime() - today.getTime()) / 86400000)
  }
  const expiringItems = () => pantryItems.filter(p => p.expiry && daysUntil(p.expiry) >= 0 && daysUntil(p.expiry) <= 3)
  const expiredItems = () => pantryItems.filter(p => p.expiry && daysUntil(p.expiry) < 0)
  const saveAllToPantry = () => {
    setPantryItems(prev => {
      const existing = new Set(prev.map(p => p.name.toLowerCase()))
      return [...prev, ...allIngredients.map(name => ({ name, addedAt: new Date().toISOString() })).filter(n => !existing.has(n.name.toLowerCase()))]
    })
  }
  const openExpiryEditor = (name: string) => {
    const ex = pantryItems.find(p => p.name.toLowerCase() === name.toLowerCase())
    setExpiryEditName(name); setExpiryEditDate(ex?.expiry || ''); setShowExpiryEditor(true)
  }
  const saveExpiry = () => {
    setPantryItems(prev => {
      const idx = prev.findIndex(p => p.name.toLowerCase() === expiryEditName.toLowerCase())
      if (idx >= 0) { const u = [...prev]; u[idx] = {...u[idx], expiry: expiryEditDate || undefined}; return u }
      return [...prev, { name: expiryEditName, expiry: expiryEditDate || undefined, addedAt: new Date().toISOString() }]
    })
    setShowExpiryEditor(false)
  }
  const addRecipeToList = (recipe: Recipe) => {
    setShoppingList(prev => {
      const ni = recipe.missedIngredients.filter(ing => !prev.some(s => s.ingredient.toLowerCase() === ing.toLowerCase()))
        .map(ing => ({ ingredient: ing, fromRecipes: [recipe.title], checked: false }))
      return [...prev, ...ni]
    })
  }
  const addSelectedRecipesToList = () => {
    const sel = recipes.filter(r => selectedForList.has(r.id))
    setShoppingList(prev => {
      let u = [...prev]
      for (const recipe of sel) {
        for (const ing of recipe.missedIngredients) {
          const idx = u.findIndex(s => s.ingredient.toLowerCase() === ing.toLowerCase())
          if (idx >= 0) { if (!u[idx].fromRecipes.includes(recipe.title)) { u[idx] = {...u[idx], fromRecipes: [...u[idx].fromRecipes, recipe.title]} } }
          else { u = [...u, { ingredient: ing, fromRecipes: [recipe.title], checked: false }] }
        }
      }
      return u
    })
    setSelectedForList(new Set())
  }
  const toggleShoppingItem = (ing: string) => setShoppingList(prev => prev.map(s => s.ingredient === ing ? {...s, checked: !s.checked} : s))
  const removeShoppingItem = (ing: string) => setShoppingList(prev => prev.filter(s => s.ingredient !== ing))
  const clearCheckedItems = () => setShoppingList(prev => prev.filter(s => !s.checked))
  const isInShoppingList = (ing: string) => shoppingList.some(s => s.ingredient.toLowerCase() === ing.toLowerCase())
  const toggleSelectedForList = (id: number) => { setSelectedForList(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s }) }


  const generateMealPlan = async () => {
    setPlanningLoading(true)
    try {
      const res = await fetch(`${API}/mealplan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetCalories: 2000 })
      })
      const data = await res.json()
      if (data.week) setMealPlan(data.week)
    } catch { console.error("Meal plan error") }
    setPlanningLoading(false)
  }

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Header */}
      <header className="bg-white border-b border-stone-100 sticky top-0 z-20">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <div><h1 className="text-lg font-bold text-stone-900">FridgeAI</h1><p className="text-xs text-stone-400">What&apos;s for dinner?</p></div>
          <div className="flex items-center gap-1">
            <button onClick={() => setTab("scan")} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${tab === "scan" ? "bg-emerald-100 text-emerald-700" : "text-stone-400 hover:text-stone-600"}`}>📷 Scan</button>
            <button onClick={() => setTab("shopping")} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1 ${tab === "shopping" ? "bg-emerald-100 text-emerald-700" : "text-stone-400 hover:text-stone-600"}`}>🛒 Cart {shoppingList.filter(s => !s.checked).length > 0 && <span className="text-xs">({shoppingList.filter(s => !s.checked).length})</span>}</button>
            <button onClick={() => setTab("cookbook")} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${tab === "cookbook" ? "bg-emerald-100 text-emerald-700" : "text-stone-400 hover:text-stone-600"}`}>📖 Cookbook {savedRecipes.length > 0 && <span className="text-xs">({savedRecipes.length})</span>}</button>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-5">

        {/* ── Cookbook Tab ── */}
        {tab === "cookbook" && (
          <div>
            {pantryItems.length > 0 && (
              <div className="card p-4 mb-4 bg-amber-50 border-amber-200">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <h3 className="font-semibold text-stone-800 text-sm flex items-center gap-1.5">🥗 My Pantry <span className="text-xs text-stone-400">({pantryItems.length})</span></h3>
                    {sheetHydrated && <span className="text-xs text-emerald-500">✓ synced</span>}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => { fetch(SHEET_CSV_URL).then(r => r.text()).then(csv => { const lines = csv.trim().split('\n'); if (lines.length < 2) return; const rows = lines.slice(1).map(l => { const v = l.split(',').map(x => x.trim().replace(/"/g, '')); return { name: v[0]||'', addedAt: v[1]||new Date().toISOString(), expiry: v[2]||'', quantity: v[3]||'1' } }).filter(r => r.name); if (rows.length > 0) setPantryItems(rows) }).catch(() => {}) }} className="text-xs text-stone-400 hover:text-emerald-500">🔄</button>
                    <button onClick={() => setPantryItems([])} className="text-xs text-stone-400 hover:text-red-500">Clear</button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {pantryItems.slice(0, 24).map(p => <span key={p.name} onClick={() => openExpiryEditor(p.name)} className={`text-xs px-2 py-1 rounded-full border cursor-pointer transition-all ${expiredItems().some(e => e.name === p.name) ? "bg-red-100 text-red-800 border-red-200 line-through" : expiringItems().some(e => e.name === p.name) ? "bg-orange-100 text-orange-800 border-orange-200" : "bg-white text-stone-600 border-amber-200 hover:border-amber-400"}`}>{p.name}{p.expiry ? ` (${daysUntil(p.expiry) >= 0 ? daysUntil(p.expiry) + "d" : "exp"})` : ""}</span>)}
                  {pantryItems.length > 24 && <span className="text-xs text-stone-400">+{pantryItems.length - 24} more</span>}
                </div>
                <button className="w-full py-2 rounded-xl bg-stone-800 text-white text-sm font-medium hover:bg-stone-900 transition-all" onClick={() => { setManualIngredients(prev => [...new Set([...prev, ...pantryItems.map(p => p.name)])]); setTab("scan"); setPhotos([]); setView("upload") }}>🔍 Search with pantry</button>
              </div>
            )}
            <div className="flex gap-2 mb-4">
              <button onClick={() => setCookbookTab("saved")} className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${cookbookTab === "saved" ? "bg-stone-800 text-white" : "bg-white text-stone-500 border border-stone-200"}`}>📌 Saved ({savedRecipes.length})</button>
              <button onClick={() => setCookbookTab("history")} className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${cookbookTab === "history" ? "bg-stone-800 text-white" : "bg-white text-stone-500 border border-stone-200"}`}>🍽 Cooked ({cookHistory.length})</button>
              <button onClick={() => { if (cookbookTab !== "plan") { setCookbookTab("plan"); if (Object.keys(mealPlan).length === 0) generateMealPlan() } }} className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${cookbookTab === "plan" ? "bg-stone-800 text-white" : "bg-white text-stone-500 border border-stone-200"}`}>📅 Plan</button>
            </div>

            {cookbookTab === "saved" && (
              <div>{savedRecipes.length === 0 ? (
                <div className="card p-8 text-center"><div className="text-4xl mb-3">📌</div><p className="text-stone-600 font-medium">No saved recipes yet</p><p className="text-stone-400 text-xs mt-1">Save recipes from search results to build your cookbook.</p></div>
              ) : (
                <div className="space-y-3">{savedRecipes.map(recipe => (
                  <div key={recipe.id} className="card p-4">
                    <div className="flex gap-3">
                      {recipe.image && <img src={recipe.image} alt={recipe.title} className="w-16 h-16 rounded-xl object-cover flex-shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-stone-900 text-sm leading-tight mb-1">{recipe.title}</p>
                        <p className="text-xs text-emerald-600 font-medium mb-2">{recipe.matchPercent}% match</p>
                        <div className="flex gap-1.5 flex-wrap">
                          <button className="text-xs px-2.5 py-1.5 rounded-lg bg-emerald-100 text-emerald-700 font-medium hover:bg-emerald-200 transition-all" onClick={() => openRecipeDetail(recipe)}>View</button>
                          <button className="text-xs px-2.5 py-1.5 rounded-lg bg-stone-100 text-stone-600 hover:bg-stone-200 transition-all" onClick={(e) => toggleSave(recipe, e)}>Unsave</button>
                          <button className="text-xs px-2.5 py-1.5 rounded-lg bg-amber-100 text-amber-700 hover:bg-amber-200 transition-all" onClick={(e) => markCooked(recipe, e)}>🍽 Made it</button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}</div>
              )}</div>
            )}

            {cookbookTab === "history" && (
              <div>{cookHistory.length === 0 ? (
                <div className="card p-8 text-center"><div className="text-4xl mb-3">🍽</div><p className="text-stone-600 font-medium">Nothing cooked yet</p><p className="text-stone-400 text-xs mt-1">Mark recipes as &quot;Made it&quot; to track your cooking history.</p></div>
              ) : (
                <div className="space-y-3">{cookHistory.map((entry, idx) => (
                  <div key={`${entry.id}-${entry.cookedAt}-${idx}`} className="card p-4">
                    <div className="flex gap-3">
                      {entry.image && <img src={entry.image} alt={entry.title} className="w-16 h-16 rounded-xl object-cover flex-shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-stone-900 text-sm leading-tight mb-1">{entry.title}</p>
                        <p className="text-xs text-stone-400 mb-2">Cooked {new Date(entry.cookedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
                        <button className="text-xs px-2.5 py-1.5 rounded-lg bg-emerald-100 text-emerald-700 font-medium hover:bg-emerald-200 transition-all" onClick={() => openRecipeDetail(entry as unknown as Recipe)}>View recipe</button>
                      </div>
                    </div>
                  </div>
                ))}</div>
              )}</div>
            )}

            {cookbookTab === "plan" && (
              <div>
                {planningLoading ? (
                  <div className="card p-8 text-center">
                    <div className="text-4xl mb-3 animate-bounce">📅</div>
                    <p className="text-stone-500 text-sm">Planning your week...</p>
                  </div>
                ) : Object.keys(mealPlan).length === 0 ? (
                  <div className="card p-8 text-center">
                    <div className="text-4xl mb-3">📅</div>
                    <p className="text-stone-600 font-medium">Weekly meal plan</p>
                    <p className="text-stone-400 text-xs mt-1">Get AI-powered breakfast, lunch & dinner ideas for the week.</p>
                    <button onClick={generateMealPlan} className="mt-4 px-5 py-2.5 rounded-xl bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600 transition-all">Generate meal plan</button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-bold text-stone-800">This week's meals</h3>
                      <button onClick={generateMealPlan} className="text-xs text-emerald-600 hover:text-emerald-700 font-medium">🔄 Regenerate</button>
                    </div>
                    {["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"].map(day => {
                      const dayLower = day.toLowerCase()
                      const meals = mealPlan[dayLower] || []
                      return (
                        <div key={day} className="card p-3">
                          <p className="text-xs font-bold text-stone-500 uppercase tracking-wide mb-2">{day}</p>
                          <div className="space-y-2">
                            {["breakfast","lunch","dinner"].map(mealType => {
                              const meal = meals.find((m: any) => m.type === mealType)
                              return (
                                <div key={mealType} className="flex items-start gap-2">
                                  <span className="text-xs w-16 flex-shrink-0 text-stone-400 capitalize">{mealType}</span>
                                  {meal ? (
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs font-medium text-stone-700 leading-tight">{meal.title}</p>
                                      <div className="flex gap-1.5 mt-1">
                                        {meal.readyInMinutes && <span className="text-xs text-stone-400">⏱ {meal.readyInMinutes}m</span>}
                                        <button onClick={() => { addRecipeToList(meal); setTab("shopping") }} className="text-xs text-teal-600 hover:text-teal-700">+ Add to cart</button>
                                      </div>
                                    </div>
                                  ) : <span className="text-xs text-stone-300 italic">Not planned</span>}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                    <button onClick={() => { const allMissing = Object.values(mealPlan).flat().filter((m: any) => m.missedIngredients).flatMap((m: any) => m.missedIngredients); openInstacart(allMissing) }} className="w-full py-2.5 rounded-xl bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600 transition-all">🛒 Add all ingredients to cart</button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Upload View ── */}
        {tab === "shopping" && (
          <div>
            {expiringItems().length > 0 && (
              <div className="card p-3 mb-4 bg-orange-50 border-orange-200">
                <p className="text-xs font-semibold text-orange-700 mb-1.5">⚠️ Expiring soon</p>
                <div className="flex flex-wrap gap-1.5">
                  {expiringItems().map(p => (
                    <span key={p.name} className="text-xs px-2 py-1 rounded-full bg-orange-100 text-orange-800">{p.name} ({daysUntil(p.expiry!)}d)</span>
                  ))}
                </div>
              </div>
            )}
            {expiredItems().length > 0 && (
              <div className="card p-3 mb-4 bg-red-50 border-red-200">
                <p className="text-xs font-semibold text-red-700 mb-1.5">❌ Expired</p>
                <div className="flex flex-wrap gap-1.5">
                  {expiredItems().map(p => (
                    <span key={p.name} className="text-xs px-2 py-1 rounded-full bg-red-100 text-red-800 line-through">{p.name}</span>
                  ))}
                </div>
              </div>
            )}
            {shoppingList.length === 0 ? (
              <div className="card p-8 text-center">
                <div className="text-4xl mb-3">🛒</div>
                <p className="text-stone-600 font-medium">Shopping list is empty</p>
                <p className="text-stone-400 text-xs mt-1">Go to Scan → find recipes → tap "Add to cart".</p>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-stone-800">{shoppingList.filter(s => !s.checked).length} to buy · {shoppingList.filter(s => s.checked).length} checked</h3>
                  <div className="flex gap-2">
                    {shoppingList.some(s => s.checked) && (
                      <button onClick={clearCheckedItems} className="text-xs text-stone-400 hover:text-red-500">Clear done</button>
                    )}
                    <button onClick={() => openInstacart(shoppingList.filter(s => !s.checked).map(s => s.ingredient))} className="text-xs px-3 py-1.5 rounded-lg bg-emerald-500 text-white font-medium hover:bg-emerald-600">Buy all on Instacart</button>
                  </div>
                </div>
                <div className="space-y-2">
                  {shoppingList.map(item => (
                    <div key={item.ingredient} className={`card p-3 flex items-center gap-3 ${item.checked ? "opacity-50" : ""}`}>
                      <button onClick={() => toggleShoppingItem(item.ingredient)} className={`w-5 h-5 rounded border flex-shrink-0 flex items-center justify-center text-xs font-bold transition-all ${item.checked ? "bg-emerald-500 border-emerald-500 text-white" : "border-stone-300 hover:border-emerald-400"}`}>{item.checked ? "✓" : ""}</button>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm ${item.checked ? "line-through text-stone-400" : "text-stone-800"}`}>{item.ingredient}</p>
                        <p className="text-xs text-stone-400 truncate">{item.fromRecipes.join(", ")}</p>
                      </div>
                      <button onClick={() => removeShoppingItem(item.ingredient)} className="text-stone-400 hover:text-red-500 text-lg leading-none flex-shrink-0">×</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "scan" && view !== "recipes" && view !== "analyzing" && (
          <div className="space-y-4">

            {pantryItems.length > 0 && (
              <div className="card p-3 bg-amber-50 border-amber-200 flex items-center justify-between">
                <span className="text-sm text-amber-800">🥗 Pantry has {pantryItems.length} items</span>
                <button className="text-xs text-amber-700 hover:text-amber-900 font-medium" onClick={() => setManualIngredients(prev => [...new Set([...prev, ...pantryItems.map(p => p.name)])])}>+ Add to scan</button>
              </div>
            )}

            <div>
              <p className="text-sm font-medium text-stone-600 mb-2">What are you photographing?</p>
              <div className="flex gap-2 flex-wrap">{AREAS.map(a => (
                <button key={a.value} onClick={() => setSelectedArea(a.value)} className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all ${selectedArea === a.value ? "bg-emerald-100 text-emerald-700 border border-emerald-300" : "bg-white text-stone-600 border border-stone-200 hover:border-stone-300"}`}>
                  <span>{a.emoji}</span> {a.label}
                </button>
              ))}</div>
            </div>

            <div className="card p-6 text-center cursor-pointer transition-all hover:border-emerald-300 hover:shadow-md" onClick={() => fileInputRef.current?.click()}>
              <div className="text-4xl mb-2">📷</div>
              <p className="font-semibold text-stone-700 mb-1">Add {AREAS.find(a => a.value === selectedArea)?.emoji} {AREAS.find(a => a.value === selectedArea)?.label} photo</p>
              <p className="text-xs text-stone-400">Tap to take or upload a photo</p>
              <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => handleFiles(e.target.files)} />
            </div>

            <button className="w-full py-2.5 border-2 border-dashed border-stone-200 rounded-xl text-sm text-stone-500 hover:border-stone-300 hover:text-stone-600 transition-all flex items-center justify-center gap-2" onClick={() => setShowManualAdd(v => !v)}>
              {showManualAdd ? "− Hide manual add" : "+ Add ingredients manually"}
            </button>

            {showManualAdd && (
              <div className="card p-4 space-y-3">
                <p className="text-xs text-stone-500">Type ingredients separated by commas, then press Add.</p>
                <div className="flex gap-2">
                  <input ref={manualInputRef} value={manualInput} onChange={e => setManualInput(e.target.value)} onKeyDown={e => e.key === "Enter" && manualInput.trim() && addManualIngredient()} placeholder="e.g. chicken breast, garlic, rice" className="flex-1 px-3 py-2 border border-stone-200 rounded-xl text-sm focus:outline-none focus:border-emerald-400" />
                  <button className="btn-primary py-2 px-4 text-sm" onClick={addManualIngredient}>Add</button>
                </div>
                {manualIngredients.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {manualIngredients.map(i => (
                      <span key={i} className="tag flex items-center gap-0.5 pr-1">{i}<button onClick={() => removeManualIngredient(i)} className="ml-0.5 text-stone-400 hover:text-red-500 text-xs leading-none">×</button></span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {photos.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-stone-800 text-sm">{photos.length} photo{photos.length > 1 ? "s" : ""} added</h3>
                  <span className="text-xs text-stone-400">{totalIngredients} ingredients</span>
                </div>

                {photos.map(photo => (
                  <div key={photo.id} className="card p-3">
                    <div className="flex gap-3">
                      <img src={photo.dataUrl} alt={photo.area} className="w-16 h-16 rounded-xl object-cover flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-stone-700">{AREAS.find(a => a.value === photo.area)?.emoji} {AREAS.find(a => a.value === photo.area)?.label}</span>
                          <div className="flex items-center gap-1">
                            <button onClick={() => startEditPhoto(photo)} className="text-stone-400 hover:text-emerald-600 text-xs px-2 py-0.5 rounded-lg hover:bg-emerald-50 transition-all" title="Edit ingredients">✎</button>
                            <button onClick={() => removePhoto(photo.id)} className="text-stone-400 hover:text-red-500 text-xs px-2 py-0.5 rounded-lg hover:bg-red-50 transition-all">✕</button>
                          </div>
                        </div>
                        {photo.analyzing && <div className="flex items-center gap-1.5 text-xs text-stone-400"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />Identifying...</div>}
                        {photo.error && <p className="text-xs text-red-500">{photo.error}</p>}
                        {!photo.analyzing && !photo.error && editingPhotoId === photo.id && (
                          <div className="space-y-1.5">
                            <textarea value={editText} onChange={e => setEditText(e.target.value)} className="w-full px-2 py-1.5 border border-emerald-300 rounded-lg text-xs resize-none focus:outline-none focus:border-emerald-500" rows={2} placeholder="Comma-separated: chicken, garlic, ..." />
                            <div className="flex gap-2">
                              <button className="text-xs px-2 py-1 rounded-lg bg-emerald-100 text-emerald-700 font-medium" onClick={() => saveEditPhoto(photo.id)}>Save</button>
                              <button className="text-xs px-2 py-1 rounded-lg bg-stone-100 text-stone-500" onClick={() => setEditingPhotoId(null)}>Cancel</button>
                            </div>
                          </div>
                        )}
                        {!photo.analyzing && !photo.error && editingPhotoId !== photo.id && photo.ingredients.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {photo.ingredients.slice(0, 8).map(i => <span key={i} className="text-xs px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">{i}</span>)}
                            {photo.ingredients.length > 8 && <span className="text-xs text-stone-400">+{photo.ingredients.length - 8} more</span>}
                          </div>
                        )}
                        {!photo.analyzing && !photo.error && photo.ingredients.length === 0 && <p className="text-xs text-stone-400">No items detected — tap ✎ to add manually</p>}
                      </div>
                    </div>
                  </div>
                ))}

                {manualIngredients.length > 0 && (
                  <div className="card p-3 bg-amber-50 border border-amber-100">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-medium text-amber-700">Manually added</span>
                      <span className="text-xs text-amber-500">{manualIngredients.length} items</span>
                    </div>
                    <div className="flex flex-wrap gap-1">{manualIngredients.map(i => <span key={i} className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-800">{i}</span>)}</div>
                  </div>
                )}

                <button onClick={() => fileInputRef.current?.click()} className="w-full py-3 border-2 border-dashed border-stone-200 rounded-xl text-sm text-stone-500 hover:border-stone-300 hover:text-stone-600 transition-all flex items-center justify-center gap-2"><span>+</span> Add another photo</button>

                {hasResults && totalIngredients > 0 && <button className="btn-primary py-4 text-base w-full" onClick={() => findRecipes()}>🍳 Find Recipes ({totalIngredients} ingredients)</button>}
                {hasResults && totalIngredients === 0 && <div className="text-center py-3 text-sm text-stone-500">No ingredients detected. Add items manually or retake photos.</div>}
              </div>
            )}

            {photos.length === 0 && manualIngredients.length === 0 && (
              <div className="card p-4">
                <h3 className="font-semibold text-stone-800 mb-2 text-sm">How it works</h3>
                <ol className="space-y-2 text-xs text-stone-500">
                  <li className="flex gap-2"><span className="text-emerald-600 font-bold">1.</span> Choose an area — fridge, freezer, pantry, or grocery haul</li>
                  <li className="flex gap-2"><span className="text-emerald-600 font-bold">2.</span> Take photos of what you have</li>
                  <li className="flex gap-2"><span className="text-emerald-600 font-bold">3.</span> Add items manually or correct AI mistakes</li>
                  <li className="flex gap-2"><span className="text-emerald-600 font-bold">4.</span> Get recipes matched to everything combined</li>
                  <li className="flex gap-2"><span className="text-emerald-600 font-bold">5.</span> Save favorites to your Cookbook</li>
                </ol>
              </div>
            )}
          </div>
        )}

        {/* ── Analyzing View ── */}
        {view === "analyzing" && (
          <div className="text-center py-16">
            <div className="grid grid-cols-3 gap-2 mb-6 max-w-xs mx-auto">{photos.slice(0, 3).map(p => <div key={p.id} className="rounded-xl overflow-hidden"><img src={p.dataUrl} alt={p.area} className="w-full aspect-square object-cover" /></div>)}</div>
            <div className="text-5xl mb-4 animate-bounce">🔍</div>
            <h2 className="text-xl font-bold text-stone-900 mb-2">Finding recipes...</h2>
            <p className="text-stone-400 text-sm">Matching your ingredients</p>
            <div className="flex items-center justify-center gap-1 mt-4">{[0, 1, 2].map(i => <div key={i} className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" style={{ animationDelay: `${i * 200}ms`, opacity: 0.4 + i * 0.2 }} />)}</div>
          </div>
        )}

        {/* ── Recipes View ── */}
        {view === "recipes" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <button className="btn-secondary text-sm" onClick={reset}>← New search</button>
              <div className="flex items-center gap-2">
                {hasActiveFilters && <button className="text-xs text-stone-400 hover:text-red-500" onClick={clearFilters}>Clear</button>}
                <button onClick={() => setShowFilters(v => !v)} className={`px-3 py-1.5 rounded-xl text-sm font-medium border transition-all ${showFilters ? "bg-stone-800 text-white border-stone-800" : "bg-white text-stone-600 border-stone-200 hover:border-stone-300"}`}>⚙ Filters {hasActiveFilters ? "•" : ""}</button>
              </div>
            </div>

            {showFilters && (
              <div className="card p-4 mb-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-stone-500 mb-1 block">Cuisine</label>
                    <select value={filters.cuisine} onChange={e => setFilters(f => ({ ...f, cuisine: e.target.value }))} className="w-full px-2 py-2 border border-stone-200 rounded-xl text-sm focus:outline-none focus:border-emerald-400">
                      {CUISINES.map(c => <option key={c} value={c === "Any" ? "" : c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-stone-500 mb-1 block">Diet</label>
                    <select value={filters.diet} onChange={e => setFilters(f => ({ ...f, diet: e.target.value }))} className="w-full px-2 py-2 border border-stone-200 rounded-xl text-sm focus:outline-none focus:border-emerald-400">
                      {DIETS.map(d => <option key={d} value={d === "Any" ? "" : d.toLowerCase().replace(/ /g, "")}>{d}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-stone-500 mb-1 block">Max cook time</label>
                  <div className="flex gap-2">{MAX_TIMES.map(t => (
                    <button key={t.label} onClick={() => setFilters(f => ({ ...f, maxReadyTime: t.value }))} className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${filters.maxReadyTime === t.value ? "bg-emerald-100 text-emerald-700 border border-emerald-300" : "bg-stone-50 text-stone-500 border border-stone-200"}`}>{t.label}</button>
                  ))}</div>
                </div>
                <button onClick={() => findRecipes(filters)} className="btn-primary w-full py-2.5 text-sm">Apply Filters</button>
              </div>
            )}

            <div className="mb-4">
              <h2 className="text-xl font-bold text-stone-900 mb-1">Your combined inventory</h2>
              <p className="text-xs text-stone-400 mb-2">{photos.length} areas · {allIngredients.length} ingredients</p>
              <div className="flex flex-wrap gap-1.5 mb-3">{allIngredients.map(i => <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-stone-200 text-stone-600">{i}</span>)}</div>
              {allIngredients.length > 0 && (
                <button onClick={saveAllToPantry} className="text-xs text-emerald-600 hover:text-emerald-700 font-medium">+ Save all to pantry</button>
              )}
            </div>

            {selectedForList.size > 0 && (
              <div className="card p-3 mb-4 bg-teal-50 border border-teal-200 flex items-center justify-between gap-3">
                <p className="text-sm text-teal-700 font-medium">{selectedForList.size} selected</p>
                <button onClick={addSelectedRecipesToList} className="text-xs px-3 py-1.5 rounded-lg bg-teal-600 text-white font-medium hover:bg-teal-700">🛒 Add all to cart</button>
              </div>
            )}

            <div className="h-px bg-stone-200 my-5" />
            <h3 className="font-bold text-stone-800 mb-3">{recipes.length} recipes you can make</h3>

            {recipes.length === 0 ? (
              <div className="card p-8 text-center"><div className="text-4xl mb-3">🤷</div><p className="text-stone-600 font-medium">No exact matches found.</p><p className="text-stone-400 text-xs mt-1">Try loosening filters or adding more ingredients.</p></div>
            ) : (
              <div className="space-y-3">{recipes.map(recipe => (
                <div key={recipe.id} className="card p-4">
                  <div className="flex gap-3">
                    {recipe.image && <img src={recipe.image} alt={recipe.title} className="w-20 h-20 rounded-xl object-cover flex-shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-stone-900 text-sm leading-tight mb-1">{recipe.title}</p>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-medium text-emerald-600">{recipe.matchPercent}% match</span>
                        <span className="text-xs text-stone-400">{recipe.usedCount} have · {recipe.missedCount} missing</span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button className="text-xs px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-700 font-medium hover:bg-emerald-200 transition-all" onClick={() => openRecipeDetail(recipe)}>View</button>
                        <button onClick={() => toggleSelectedForList(recipe.id)} className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-all ${selectedForList.has(recipe.id) ? "bg-teal-100 text-teal-700 border border-teal-300" : "bg-stone-100 text-stone-600 hover:bg-stone-200"}`}>{selectedForList.has(recipe.id) ? "✓ In cart" : "+ Cart"}</button>
                        <button className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-all ${isSaved(recipe.id) ? "bg-amber-200 text-amber-800" : "bg-stone-100 text-stone-600 hover:bg-stone-200"}`} onClick={(e) => toggleSave(recipe, e)}>
                          {isSaved(recipe.id) ? "★ Saved" : "☆ Save"}
                        </button>
                        <button className="text-xs px-2.5 py-1 rounded-lg bg-amber-100 text-amber-700 hover:bg-amber-200 transition-all" onClick={(e) => markCooked(recipe, e)}>🍽 Made it</button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}</div>
            )}
          </div>
        )}

        {/* ── Error View ── */}
        {view === "error" && (
          <div className="text-center py-12">
            <div className="text-5xl mb-4">😅</div>
            <h2 className="text-xl font-bold text-stone-900 mb-2">Couldn&apos;t analyze that</h2>
            <p className="text-stone-500 text-sm mb-6">{error}</p>
            <button className="btn-primary max-w-xs mx-auto" onClick={reset}>Try again</button>
          </div>
        )}
      </main>

      {/* ── Recipe Detail Modal ── */}
      {selectedRecipe && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={e => e.target === e.currentTarget && setSelectedRecipe(null)}
        >
          <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-stone-100 p-4 flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-stone-900 leading-tight">{selectedRecipe.title}</h3>
                {selectedRecipe.image && (
                  <img src={selectedRecipe.image} alt={selectedRecipe.title} className="w-full h-48 object-cover rounded-xl mt-3" />
                )}
              </div>
              <button
                className="text-stone-400 hover:text-stone-600 text-2xl leading-none flex-shrink-0 mt-1"
                onClick={() => setSelectedRecipe(null)}
              >×</button>
            </div>

            <div className="px-4 py-3 bg-emerald-50 flex items-center gap-3">
              <div className="flex-1">
                <p className="text-xs text-emerald-600 font-medium">Ingredients you have</p>
                <p className="text-sm text-stone-700">
                  {selectedRecipe.usedCount} of {selectedRecipe.usedCount + selectedRecipe.missedCount}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-emerald-600 font-medium">Match</p>
                <p className="text-lg font-bold text-emerald-600">{selectedRecipe.matchPercent}%</p>
              </div>
            </div>

            {selectedRecipe.missedIngredients.length > 0 && (
              <div className="px-4 py-3 border-b border-stone-100 space-y-3">
                <div>
                  <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-2">You need</p>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedRecipe.missedIngredients.map((ing, i) => (
                      <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-stone-100 text-stone-600">{ing}</span>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => addRecipeToList(selectedRecipe)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${isInShoppingList(selectedRecipe.missedIngredients[0]) ? "bg-teal-100 text-teal-700 border border-teal-300" : "bg-teal-500 text-white hover:bg-teal-600"}`}
                  >
                    {isInShoppingList(selectedRecipe.missedIngredients[0]) ? "✓ In cart" : "🛒 Add to cart"}
                  </button>
                  <button
                    onClick={() => openInstacart(selectedRecipe.missedIngredients)}
                    className="flex-1 py-2.5 rounded-xl bg-stone-800 text-white font-semibold text-sm hover:bg-stone-900 transition-all flex items-center justify-center gap-2"
                  >
                    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor"><path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.3 2.3c-.6.6-.2 1.7.6 1.7H17M17 17a2 2 0 100-4 2 2 0 000 4zM9 17a2 2 0 100-4 2 2 0 000 4z"/></svg>
                    Instacart
                  </button>
                </div>
              </div>
            )}

            <div className="p-4">
              {loadingDetail ? (
                <div className="text-center py-8 text-stone-400 text-sm">Loading recipe...</div>
              ) : recipeDetail?.error ? (
                <p className="text-stone-500 text-sm">{recipeDetail.error}</p>
              ) : recipeDetail?.summary ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 text-sm text-stone-500">
                    {recipeDetail.info?.readyInMinutes && <span>⏱ {recipeDetail.info.readyInMinutes} min</span>}
                    {recipeDetail.info?.servings && <span>🍽 {recipeDetail.info.servings} servings</span>}
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setServingScale(s => Math.max(0.5, s - 0.5))} className="w-7 h-7 rounded-lg bg-stone-100 text-stone-600 text-sm font-bold hover:bg-stone-200">−</button>
                    <span className="text-xs font-medium w-16 text-center">{servingScale}x</span>
                    <button onClick={() => setServingScale(s => s + 0.5)} className="w-7 h-7 rounded-lg bg-stone-100 text-stone-600 text-sm font-bold hover:bg-stone-200">+</button>
                  </div>
                </div>
                  <p
                    className="text-sm text-stone-600 leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: (recipeDetail.summary || "").replace(/<[^>]+>/g, "") }}
                  />
                  {getInstructions(selectedRecipe).length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-2 mt-3">Instructions</p>
                      <ol className="space-y-2">
                        {getInstructions(selectedRecipe).slice(0, 6).map((step, i) => (
                          <li key={i} className="flex gap-2 text-sm text-stone-600">
                            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                            <span>{step}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                  {recipeDetail.info?.sourceUrl && (
                    <a
                      href={recipeDetail.info.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-primary text-center text-sm py-2 block"
                    >
                      View full recipe →
                    </a>
                  )}
                </div>
              ) : (
                <p className="text-stone-400 text-sm">Recipe details unavailable.</p>
              )}
            </div>

            <div className="px-4 pb-4 flex gap-2">
              <button
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${isSaved(selectedRecipe.id) ? "bg-amber-200 text-amber-800" : "bg-stone-100 text-stone-600 hover:bg-stone-200"}`}
                onClick={(e) => toggleSave(selectedRecipe, e)}
              >
                {isSaved(selectedRecipe.id) ? "★ Saved" : "☆ Save"}
              </button>
              <button
                className="flex-1 py-2.5 rounded-xl bg-amber-100 text-amber-700 text-sm font-semibold hover:bg-amber-200 transition-all"
                onClick={(e) => markCooked(selectedRecipe, e)}
              >
                🍽 Made it
              </button>
              {getInstructions(selectedRecipe).length > 0 && (
                <button
                  className="flex-1 py-2.5 rounded-xl bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600 transition-all"
                  onClick={() => startCooking(selectedRecipe)}
                >
                  👨‍🍳 Cook Mode
                </button>
              )}
            </div>
          </div>
        </div>
      )}
 
      {cookingRecipe && (() => {
        const steps = getInstructions(cookingRecipe)
        const currentStep = steps[cookingStep] || ''
        const total = steps.length
        return (
          <div className="fixed inset-0 bg-stone-900 z-50 flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 bg-stone-800">
              <button onClick={() => { setCookingRecipe(null); window.speechSynthesis?.cancel() }} className="text-stone-400 hover:text-white text-sm">✕ Close</button>
              <p className="text-stone-400 text-xs">{cookingStep + 1} / {total}</p>
              <button onClick={() => speakStep(currentStep)} className="text-stone-400 hover:text-white text-sm">🔊 Hear</button>
            </div>
            {/* Progress */}
            <div className="h-1 bg-stone-700">
              <div className="h-full bg-emerald-500 transition-all" style={{ width: `${total > 0 ? ((cookingStep + 1) / total) * 100 : 0}%` }} />
            </div>
            {/* Step content */}
            <div className="flex-1 flex flex-col items-center justify-center p-8">
              <div className="text-6xl mb-6">{cookingStep === 0 ? '🍳' : cookingStep === total - 1 ? '🍽️' : '🔥'}</div>
              <p className="text-2xl font-bold text-white text-center leading-relaxed mb-8">{currentStep}</p>
              <div className="flex gap-3">
                <button
                  onClick={() => { setCookingStep(s => Math.max(0, s - 1)); window.speechSynthesis?.cancel() }}
                  disabled={cookingStep === 0}
                  className="px-6 py-3 rounded-xl bg-stone-700 text-white font-medium disabled:opacity-30 hover:bg-stone-600 transition-all"
                >← Back</button>
                {cookingStep < total - 1 ? (
                  <button
                    onClick={() => { setCookingStep(s => s + 1); window.speechSynthesis?.cancel() }}
                    className="px-6 py-3 rounded-xl bg-emerald-500 text-white font-semibold hover:bg-emerald-600 transition-all"
                  >Next →</button>
                ) : (
                  <button
                    onClick={() => { markCooked(cookingRecipe, undefined as any); setCookingRecipe(null); window.speechSynthesis?.cancel() }}
                    className="px-6 py-3 rounded-xl bg-amber-500 text-white font-semibold hover:bg-amber-600 transition-all"
                  >🍽️ Done!</button>
                )}
              </div>
            </div>
            {/* Step dots */}
            <div className="flex justify-center gap-2 pb-8">
              {steps.map((_, i) => (
                <button key={i} onClick={() => { setCookingStep(i); window.speechSynthesis?.cancel() }}
                  className={`w-2.5 h-2.5 rounded-full transition-all ${i === cookingStep ? 'bg-emerald-400' : i < cookingStep ? 'bg-emerald-700' : 'bg-stone-600'}`}
                />
              ))}
            </div>
          </div>
        )
      })()}

      {showExpiryEditor && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && setShowExpiryEditor(false)}
        >
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm">
            <h3 className="font-bold text-stone-900 mb-1">Set expiry date</h3>
            <p className="text-sm text-stone-500 mb-4">{expiryEditName}</p>
            <input
              type="date"
              value={expiryEditDate}
              onChange={e => setExpiryEditDate(e.target.value)}
              className="w-full px-3 py-2 border border-stone-200 rounded-xl text-sm focus:outline-none focus:border-emerald-400 mb-4"
            />
            <div className="flex gap-2">
              <button
                className="flex-1 py-2.5 rounded-xl bg-stone-100 text-stone-600 text-sm font-medium hover:bg-stone-200 transition-all"
                onClick={() => setShowExpiryEditor(false)}
              >Cancel</button>
              <button
                className="flex-1 py-2.5 rounded-xl bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600 transition-all"
                onClick={saveExpiry}
              >Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}