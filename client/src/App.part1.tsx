import { useState, useRef, useEffect } from 'react'

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

type PantryItem = {
  name: string
  expiry?: string
  addedAt: string
}

type ShoppingItem = {
  ingredient: string
  fromRecipes: string[]
  checked: boolean
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
const LS_PANTRY = "fridgeai_pantry_v2"
const LS_SHOPPING = "fridgeai_shopping"

export default function App() {
  const [tab, setTab] = useState<"scan" | "cookbook" | "shopping">("scan")
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
  const [pantryItems, setPantryItems] = useState<PantryItem[]>(() => loadFromStorage(LS_PANTRY, [] as PantryItem[]))
  const [shoppingList, setShoppingList] = useState<ShoppingItem[]>(() => loadFromStorage(LS_SHOPPING, [] as ShoppingItem[]))
  const [cookbookTab, setCookbookTab] = useState<"saved" | "history">("saved")
  const [selectedForList, setSelectedForList] = useState<Set<number>>(new Set())
  const [showExpiryEditor, setShowExpiryEditor] = useState(false)
  const [expiryEditName, setExpiryEditName] = useState("")
  const [expiryEditDate, setExpiryEditDate] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)
  const manualInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { saveToStorage(LS_SAVED, savedRecipes) }, [savedRecipes])
  useEffect(() => { saveToStorage(LS_HISTORY, cookHistory) }, [cookHistory])
  useEffect(() => { saveToStorage(LS_PANTRY, pantryItems) }, [pantryItems])
  useEffect(() => { saveToStorage(LS_SHOPPING, shoppingList) }, [shoppingList])

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
      const res = await fetch(`/api/analyze`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageUrl: dataUrl }) })
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

  const daysUntil = (dateStr: string) => {
    const today = new Date(); today.setHours(0,0,0,0)
    const exp = new Date(dateStr); exp.setHours(0,0,0,0)
    return Math.round((exp.getTime() - today.getTime()) / 86400000)
  }

  const expiringItems = () => pantryItems.filter(p => p.expiry && daysUntil(p.expiry) >= 0 && daysUntil(p.expiry) <= 3)
  const expiredItems = () => pantryItems.filter(p => p.expiry && daysUntil(p.expiry) < 0)

  const saveAllToPantry = () => {
    setPantryItems(prev => {
      const existing = new Set(prev.map(p => p.name.toLowerCase()))
      const newItems = allIngredients.map(name => ({ name, addedAt: new Date().toISOString() }))
      return [...prev, ...newItems.filter(n => !existing.has(n.name.toLowerCase()))]
    })
  }

  const openExpiryEditor = (name: string) => {
    const existing = pantryItems.find(p => p.name.toLowerCase() === name.toLowerCase())
    setExpiryEditName(name); setExpiryEditDate(existing?.expiry || ""); setShowExpiryEditor(true)
  }

  const saveExpiry = () => {
    setPantryItems(prev => {
      const idx = prev.findIndex(p => p.name.toLowerCase() === expiryEditName.toLowerCase())
      if (idx >= 0) {
        const u = [...prev]; u[idx] = { ...u[idx], expiry: expiryEditDate || undefined }; return u
      }
      return [...prev, { name: expiryEditName, expiry: expiryEditDate || undefined, addedAt: new Date().toISOString() }]
    })
    setShowExpiryEditor(false)
  }

  const addRecipeToList = (recipe: Recipe) => {
    setShoppingList(prev => {
      const newItems = recipe.missedIngredients.filter(ing => !prev.some(s => s.ingredient.toLowerCase() === ing.toLowerCase()))
        .map(ing => ({ ingredient: ing, fromRecipes: [recipe.title], checked: false }))
      return [...prev, ...newItems]
    })
  }

  const addSelectedRecipesToList = () => {
    const selected = recipes.filter(r => selectedForList.has(r.id))
    setShoppingList(prev => {
      const updated = [...prev]
      for (const recipe of selected) {
        for (const ing of recipe.missedIngredients) {
          const idx = updated.findIndex(s => s.ingredient.toLowerCase() === ing.toLowerCase())
          if (idx >= 0) {
            if (!updated[idx].fromRecipes.includes(recipe.title)) {
              updated[idx] = { ...updated[idx], fromRecipes: [...updated[idx].fromRecipes, recipe.title] }
            }
          } else {
            updated = [...updated, { ingredient: ing, fromRecipes: [recipe.title], checked: false }]
          }
        }
      }
      return updated
    })
    setSelectedForList(new Set())
  }

  const toggleShoppingItem = (ingredient: string) => setShoppingList(prev => prev.map(s => s.ingredient === ingredient ? { ...s, checked: !s.checked } : s))
  const removeShoppingItem = (ingredient: string) => setShoppingList(prev => prev.filter(s => s.ingredient !== ingredient))
  const clearCheckedItems = () => setShoppingList(prev => prev.filter(s => !s.checked))
  const isInShoppingList = (ingredient: string) => shoppingList.some(s => s.ingredient.toLowerCase() === ingredient.toLowerCase())

  const findRecipes = async (overrides?: Partial<Filters>) => {
    const unique = buildIngredients()
    if (unique.length === 0) { setError("No ingredients found."); setView("error"); return }
    setAllIngredients(unique); setView("analyzing"); setShowFilters(false)
    const activeFilters = { ...filters, ...overrides }
    try {
      const res = await fetch(`/api/recipes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ingredients: unique, cuisine: activeFilters.cuisine || undefined, diet: activeFilters.diet || undefined, maxReadyTime: activeFilters.maxReadyTime || undefined }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Recipe search failed")
      setRecipes(data.recipes || []); setView("recipes")
    } catch (err: any) { setError(err.message || "Something went wrong."); setView("error") }
  }

  const clearFilters = () => { setFilters({ cuisine: "", diet: "", maxReadyTime: 0 }); findRecipes({ cuisine: "", diet: "", maxReadyTime: 0 } as Filters) }
  const isSaved = (id: number) => savedRecipes.some(r => r.id === id)

  const toggleSave = (recipe: Recipe, e?: React.MouseEvent) => {
    e?.stopPropagation()
    if (isSaved(recipe.id)) { setSavedRecipes(prev => prev.filter(r => r.id !== recipe.id)) }
    else { setSavedRecipes(prev => prev.some(r => r.id === recipe.id) ? prev : [...prev, recipe]) }
  }

  const markCooked = (recipe: Recipe, e?: React.MouseEvent) => {
    e?.stopPropagation()
    const entry: CookHistoryEntry = { id: recipe.id, title: recipe.title, image: recipe.image, cookedAt: new Date().toISOString(), matchPercent: recipe.matchPercent }
    setCookHistory(prev => [entry, ...prev.filter(h => h.id !== recipe.id)])
  }

  const openRecipeDetail = async (recipe: Recipe) => {
    setSelectedRecipe(recipe); setRecipeDetail(null); setLoadingDetail(true)
    try { const res = await fetch(`/api/recipes/${recipe.id}`); const data = await res.json(); setRecipeDetail(data) }
    catch { setRecipeDetail({ error: "Could not load recipe details" }) }
    finally { setLoadingDetail(false) }
  }

  const openInstacart = (ingredients: string[]) => {
    const query = ingredients.map(i => i.replace(/[^a-zA-Z0-9 ]/g, "").trim()).join(", ")
    window.open(`https://www.instacart.com/store/search?q=${encodeURIComponent(query)}`, "_blank", "noopener,noreferrer")
  }

  const reset = () => {
    setPhotos([]); setManualIngredients([]); setRecipes([]); setAllIngredients([])
    setView("upload"); setError(""); setSelectedRecipe(null); setRecipeDetail(null)
    setFilters({ cuisine: "", diet: "", maxReadyTime: 0 }); setShowFilters(false); setSelectedForList(new Set())
  }

  const hasActiveFilters = Object.values(filters).some(v => v !== "" && v !== 0)

  const toggleSelectedForList = (id: number) => {
    setSelectedForList(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="bg-white border-b border-stone-100 sticky top-0 z-20">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <div><h1 className="text-lg font-bold text-stone-900">FridgeAI</h1><p className="text-xs text-stone-400">What&apos;s for dinner?</p></div>
          <div className="flex items-center gap-1">
            <button onClick={() => setTab("scan")} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${tab === "scan" ? "bg-emerald-100 text-emerald-700" : "text-stone-400"}`}>📷 Scan</button>
            <button onClick={() => setTab("shopping")} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1 ${tab === "shopping" ? "bg-emerald-100 text-emerald-700" : "text-stone-400"}`}>🛒 Cart {shoppingList.filter(s => !s.checked).length > 0 && <span className="text-xs">({shoppingList.filter(s => !s.checked).length})</span>}</button>
            <button onClick={() => setTab("cookbook")} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${tab === "cookbook" ? "bg-emerald-100 text-emerald-700" : "text-stone-400"}`}>📖 {savedRecipes.length > 0 ? `Cookbook (${savedRecipes.length})` : "Cookbook"}</button>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-5">

        {/* ── SHOPPING TAB ── */}
        {tab === "shopping" && (
          <div>
            {expiringItems().length > 0 && (
              <div className="card p-3 mb-4 bg-orange-50 border-orange-200">
                <p className="text-xs font-semibold text-orange-700 mb-1.5">⚠️ Expiring soon</p>
                <div className="flex flex-wrap gap-1.5">{expiringItems().map(p => <span key={p.name} className="text-xs px-2 py-1 rounded-full bg-orange-100 text-orange-800">{p.name} ({daysUntil(p.expiry!)}d)</span>)}</div>
              </div>
            )}
            {expiredItems().length > 0 && (
              <div className="card p-3 mb-4 bg-red-50 border-red-200">
                <p className="text-xs font-semibold text-red-700 mb-1.5">❌ Expired</p>
                <div className="flex flex-wrap gap-1.5">{expiredItems().map(p => <span key={p.name} className="text-xs px-2 py-1 rounded-full bg-red-100 text-red-800 line-through">{p.name}</span>)}</div>
              </div>
            )}
            {shoppingList.length === 0 ? (
              <div className="card p-8 text-center"><div className="text-4xl mb-3">🛒</div><p className="text-stone-600 font-medium">Shopping list is empty</p><p className="text-stone-400 text-xs mt-1">Go to Scan → find recipes → tap "Add to cart" on ones you want to make.</p></div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-stone-800">{shoppingList.filter(s => !s.checked).length} to buy · {shoppingList.filter(s => s.checked).length} checked</h3>
                  <div className="flex gap-2">
                    {shoppingList.some(s => s.checked) && <button onClick={clearCheckedItems} className="text-xs text-stone-400 hover:text-red-500">Clear done</button>}
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

        {/* ── COOKBOOK TAB ── */}
        {tab === "cookbook" && (
          <div>
            {pantryItems.length > 0 && (
              <div className="card p-4 mb-4 bg-amber-50 border-amber-200">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-stone-800 text-sm flex items-center gap-1.5">🥗 My Pantry <span className="text-xs text-stone-400">({pantryItems.length})</span></h3>
                  <button onClick={() => setPantryItems([])} className="text-xs text-stone-400 hover:text-red-500">Clear</button>
                </div>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {pantryItems.slice(0, 24).map(p => (
                    <span key={p.name} onClick={() => openExpiryEditor(p.name)}
                      className={`text-xs px-2 py-1 rounded-full border cursor-pointer transition-all ${expiredItems().some(e => e.name === p.name) ? "bg-red-100 text-red-800 border-red-200 line-through" : expiringItems().some(e => e.name === p.name) ? "bg-orange-100 text-orange-800 border-orange-200" : "bg-white text-stone-600 border-amber-200 hover:border-amber-400"}`}
                    >{p.name}{p.expiry ? ` (${daysUntil(p.expiry) >= 0 ? daysUntil(p.expiry) + "d" : "exp"})` : ""}</span>
                  ))}
                  {pantryItems.length > 24 && <span className="text-xs text-stone-400">+{pantryItems.length - 24} more</span>}
                </div>
                <button className="w-full py-2 rounded-xl bg-stone-800 text-white text-sm font-medium hover:bg-stone-900 transition-all" onClick={() => { setManualIngredients(prev => [...new Set([...prev, ...pantryItems.map(p => p.name)])]); setTab("scan"); setPhotos([]); setView("upload") }}>🔍 Search with pantry</button>
              </div>
            )}
            <div className="flex gap-2 mb-4">
              <button onClick={() => setCookbookTab("saved")} className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${cookbookTab === "saved" ? "bg-stone-800 text-white" : "bg-white text-stone-500 border border-stone-200"}`}>📌 Saved ({savedRecipes.length})</button>
              <button onClick={() => setCookbookTab("history")} className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${cookbookTab === "history" ? "bg-stone-800 text-white" : "bg-white text-stone-500 border border-stone-200"}`}>🍽 Cooked ({cookHistory.length})</button>
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
          </div>
        )}

        {/* ── UPLOAD VIEW ── */}
        {tab === "scan" && view !== "recipes" && view !== "analyzing" && (
          <div className="space-y-4">
            {pantryItems.length > 0 && (
              <div className="card p-3 bg-amber-50 border-amber-200 flex items-center justify-between">
                <div>
                  <span className="text-sm text-amber-800">🥗 Pantry has {pantryItems.length} items</span>
                  {expiringItems().length > 0 && <span className="ml-2 text-xs text-orange-600 font-medium">⚠️ {expiringItems().length} expiring</span>}
                </div>
                <button className="text-xs text-amber-700 hover:text-amber-900 font-medium" onClick={() => setManualIngredients(prev => [...new Set([...prev, ...pantryItems.map(p => p.name)])])}>+ Add to scan</button>
              </div>
            )}
            <div>
              <p className="text-sm font-medium text-stone-600 mb-2">What are you photographing?</p>
              <div className="flex gap-2 flex-wrap">{AREAS.map(a => (
                <button key={a.value} onClick={() => setSelectedArea(a.value)} className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all ${selectedArea === a.value ? "bg-emerald-100 text-emerald-700 border border-emerald-300" : "bg-white text-stone-600 border border-stone-200"}`}><span>{a.emoji}</span> {a.label}</button>
              ))}</div>
            </div>
            <div className="card p-6 text-center cursor-pointer hover:border-emerald-300 hover:shadow-md transition-all" onClick={() => fileInputRef.current?.click()}>
              <div className="text-4xl mb-2">📷</div>
              <p className="font-semibold text-stone-700 mb-1">Add {AREAS.find(a => a.value === selectedArea)?.emoji} {AREAS.find(a => a.value === selectedArea)?.label} photo</p>
              <p className="text-xs text-stone-400">Tap to take or upload a photo</p>
              <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => handleFiles(e.target.files)} />
            </div>
            <button className="w-full py-2.5 border-2 border-dashed border-stone-200 rounded-xl text-sm text-stone-500 hover:border-stone-300 hover:text-stone-600 transition-all flex items-center justify-center gap-2" onClick={() => setShowManualAdd(v => !v)}>
              {showManualAdd ? "− Hide" : "+ Add ingredients manually"}
            </button>
            {showManualAdd && (
              <div className="card p-4 space-y-3">
                <p className="text-xs text-stone-500">Comma-separated. Press Add.</p>
                <div className="flex gap-2">
                  <input ref={manualInputRef} value={manualInput} onChange={e => setManualInput(e.target.value)} onKeyDown={e => e.key === "Enter" && manualInput.trim() && addManualIngredient()} placeholder="chicken, garlic, rice..." className="flex-1 px-3 py-2 border border-stone-200 rounded-xl text-sm focus:outline-none focus:border-emerald-400" />
                  <button className="btn-primary py-2 px-4 text-sm" onClick={addManualIngredient}>Add</button>
                </div>
                {manualIngredients.length > 0 && <div className="flex flex-wrap gap-1.5">{manualIngredients.map(i => <span key={i} className="tag flex items-center gap-0.5 pr-1">{i}<button onClick={() => removeManualIngredient(i)} className="ml-0.5 text-stone-400 hover:text-red-500 text-xs leading-none">×</button></span>)}</div>}
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
                            <button onClick={() => startEditPhoto(photo)} className="text-stone-400 hover:text-emerald-600 text-xs px-2 py-0.5 rounded-lg hover:bg-emerald-50 transition-all" title="Edit">✎</button>
                            <button onClick={() => removePhoto(photo.id)} className="text-stone-400 hover:text-red-500 text-xs px-2 py-0.5 rounded-lg hover:bg-red-50 transition-all">✕</button>
                          </div>
                        </div>
                        {photo.analyzing && <div className="flex items-center gap-1.5 text-xs text-stone-400"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />Identifying...</div>}
                        {photo.error && <p className="text-xs text-red-500">{photo.error}</p>}
                        {!photo.analyzing && !photo.error && editingPhotoId === photo.id && (
                          <div className="space-y-1.5">
                            <textarea value={editText} onChange={e => setEditText(e.target.value)} className="w-full px-2 py-1.5 border border-emerald-300 rounded-lg text-xs resize-none focus:outline-none focus:border-emerald-500" rows={2} placeholder="Comma-separated..." />
                            <div className="flex gap-2">
                              <button className="text-xs px-2 py-1 rounded-lg bg-emerald-100 text-emerald-700 font-medium" onClick={() => saveEditPhoto(photo.id)}>Save</button>
                              <button className="text-xs px-2 py-1 rounded-lg bg-stone-100 text-stone-500" onClick={() => setEditingPhotoId(null)}>Cancel</button>
                            </div>
                          </div>
                        )}
                        {!photo.analyzing && !photo.error && editingPhotoId !== photo.id && photo.ingredients.length > 0 && (
                          <div className="flex flex-wrap gap-1">{photo.ingredients.slice(0, 8).map(i => <span