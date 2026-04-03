import { useState, useRef } from 'react'

type Recipe = {
  id: number
  title: string
  image: string
  usedCount: number
  missedCount: number
  missedIngredients: string[]
  matchPercent: number
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

const AREAS: { value: Area; label: string; emoji: string }[] = [
  { value: 'fridge', label: 'Fridge', emoji: '🧊' },
  { value: 'freezer', label: 'Freezer', emoji: '❄️' },
  { value: 'pantry', label: 'Pantry', emoji: '🫙' },
  { value: 'grocery', label: 'Grocery Haul', emoji: '🛒' },
]

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export default function App() {
  const [photos, setPhotos] = useState<Photo[]>([])
  const [selectedArea, setSelectedArea] = useState<Area>('fridge')
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [allIngredients, setAllIngredients] = useState<string[]>([])
  const [view, setView] = useState<'upload' | 'analyzing' | 'recipes' | 'error'>('upload')
  const [error, setError] = useState('')
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null)
  const [recipeDetail, setRecipeDetail] = useState<any>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const file = files[0]
    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file.')
      setView('error')
      return
    }
    const dataUrl = await fileToDataUrl(file)
    const id = Math.random().toString(36).slice(2)

    const newPhoto: Photo = {
      id,
      area: selectedArea,
      dataUrl,
      ingredients: [],
      analyzing: true,
    }

    setPhotos(prev => [...prev, newPhoto])
    analyzePhoto(id, dataUrl)
  }

  const analyzePhoto = async (id: string, dataUrl: string) => {
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: dataUrl })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Analysis failed')

      setPhotos(prev => prev.map(p =>
        p.id === id
          ? { ...p, ingredients: data.ingredients || [], analyzing: false }
          : p
      ))
    } catch (err: any) {
      setPhotos(prev => prev.map(p =>
        p.id === id
          ? { ...p, analyzing: false, error: err.message }
          : p
      ))
    }
  }

  const removePhoto = (id: string) => {
    setPhotos(prev => prev.filter(p => p.id !== id))
  }

  const hasResults = photos.length > 0 && photos.every(p => !p.analyzing)

  const findRecipes = async () => {
    const ingredients = photos.flatMap(p => p.ingredients)
    // Dedupe and clean
    const unique = [...new Set(ingredients.map(i => i.toLowerCase().trim()))]

    if (unique.length === 0) {
      setError('No ingredients found. Try clearer photos with better lighting.')
      setView('error')
      return
    }

    setAllIngredients(unique)
    setView('analyzing')

    try {
      const res = await fetch('/api/recipes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ingredients: unique })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Recipe search failed')
      setRecipes(data.recipes || [])
      setView('recipes')
    } catch (err: any) {
      setError(err.message || 'Something went wrong.')
      setView('error')
    }
  }

  const reset = () => {
    setPhotos([])
    setRecipes([])
    setAllIngredients([])
    setView('upload')
    setError('')
    setSelectedRecipe(null)
    setRecipeDetail(null)
  }

  const openInstacart = (ingredients: string[]) => {
    const query = ingredients.map(i => i.replace(/[^a-zA-Z0-9 ]/g, '').trim()).join(', ')
    const url = `https://www.instacart.com/store/search?q=${encodeURIComponent(query)}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const openRecipeDetail = async (recipe: Recipe) => {
    setSelectedRecipe(recipe)
    setRecipeDetail(null)
    setLoadingDetail(true)
    try {
      const res = await fetch(`/api/recipes/${recipe.id}`)
      const data = await res.json()
      setRecipeDetail(data)
    } catch {
      setRecipeDetail({ error: 'Could not load recipe details' })
    } finally {
      setLoadingDetail(false)
    }
  }

  const totalIngredients = photos.reduce((sum, p) => sum + p.ingredients.length, 0)
  const analyzingCount = photos.filter(p => p.analyzing).length

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Header */}
      <header className="bg-white border-b border-stone-100 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-stone-900">FridgeAI</h1>
            <p className="text-xs text-stone-400">What's for dinner?</p>
          </div>
          <div className="text-3xl">🥗</div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6">

        {/* ── Upload View ── */}
        {view === 'upload' && (
          <div className="space-y-4">

            {/* Area selector */}
            <div>
              <p className="text-sm font-medium text-stone-600 mb-2">What are you photographing?</p>
              <div className="flex gap-2 flex-wrap">
                {AREAS.map(a => (
                  <button
                    key={a.value}
                    onClick={() => setSelectedArea(a.value)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                      selectedArea === a.value
                        ? 'bg-emerald-100 text-emerald-700 border border-emerald-300'
                        : 'bg-white text-stone-600 border border-stone-200 hover:border-stone-300'
                    }`}
                  >
                    <span>{a.emoji}</span> {a.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Camera / Upload */}
            <div
              className="card p-6 text-center cursor-pointer transition-all hover:border-emerald-300 hover:shadow-md"
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="text-4xl mb-2">📷</div>
              <p className="font-semibold text-stone-700 mb-1">
                Add {AREAS.find(a => a.value === selectedArea)?.emoji}{' '}
                {AREAS.find(a => a.value === selectedArea)?.label} photo
              </p>
              <p className="text-xs text-stone-400">Tap to take or upload a photo</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={e => handleFiles(e.target.files)}
              />
            </div>

            {/* Photo gallery */}
            {photos.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-stone-800 text-sm">
                    {photos.length} photo{photos.length > 1 ? 's' : ''} added
                  </h3>
                  {photos.length > 0 && (
                    <span className="text-xs text-stone-400">
                      {totalIngredients} ingredients found
                    </span>
                  )}
                </div>

                {photos.map(photo => (
                  <div key={photo.id} className="card p-3">
                    <div className="flex gap-3">
                      <img
                        src={photo.dataUrl}
                        alt={photo.area}
                        className="w-16 h-16 rounded-xl object-cover flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-stone-700">
                            {AREAS.find(a => a.value === photo.area)?.emoji}{' '}
                            {AREAS.find(a => a.value === photo.area)?.label}
                          </span>
                          <button
                            onClick={() => removePhoto(photo.id)}
                            className="text-stone-400 hover:text-red-500 text-xs px-2 py-0.5 rounded-lg hover:bg-red-50 transition-all"
                          >
                            ✕
                          </button>
                        </div>

                        {photo.analyzing && (
                          <div className="flex items-center gap-1.5 text-xs text-stone-400">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Identifying ingredients...
                          </div>
                        )}

                        {photo.error && (
                          <p className="text-xs text-red-500">{photo.error}</p>
                        )}

                        {!photo.analyzing && !photo.error && photo.ingredients.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {photo.ingredients.slice(0, 6).map(i => (
                              <span key={i} className="text-xs px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">
                                {i}
                              </span>
                            ))}
                            {photo.ingredients.length > 6 && (
                              <span className="text-xs text-stone-400">+{photo.ingredients.length - 6} more</span>
                            )}
                          </div>
                        )}

                        {!photo.analyzing && !photo.error && photo.ingredients.length === 0 && (
                          <p className="text-xs text-stone-400">No ingredients found</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {/* Add more photos */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-3 border-2 border-dashed border-stone-200 rounded-xl text-sm text-stone-500 hover:border-stone-300 hover:text-stone-600 transition-all flex items-center justify-center gap-2"
                >
                  <span>+</span> Add another photo
                </button>

                {/* Find recipes CTA */}
                {hasResults && totalIngredients > 0 && (
                  <button className="btn-primary py-4 text-base" onClick={findRecipes}>
                    🍳 Find {recipes.length > 0 ? 'better ' : ''}Recipes ({totalIngredients} ingredients)
                  </button>
                )}

                {hasResults && totalIngredients === 0 && (
                  <div className="text-center py-3 text-sm text-stone-500">
                    No ingredients detected. Try clearer photos.
                  </div>
                )}
              </div>
            )}

            {photos.length === 0 && (
              <div className="card p-4">
                <h3 className="font-semibold text-stone-800 mb-2 text-sm">How it works</h3>
                <ol className="space-y-2 text-xs text-stone-500">
                  <li className="flex gap-2"><span className="text-emerald-600 font-bold">1.</span> Choose an area — fridge, freezer, pantry, or grocery haul</li>
                  <li className="flex gap-2"><span className="text-emerald-600 font-bold">2.</span> Take photos of what you have</li>
                  <li className="flex gap-2"><span className="text-emerald-600 font-bold">3.</span> Add as many areas as you want</li>
                  <li className="flex gap-2"><span className="text-emerald-600 font-bold">4.</span> Get recipes matched to everything combined</li>
                </ol>
              </div>
            )}
          </div>
        )}

        {/* ── Analyzing View ── */}
        {view === 'analyzing' && (
          <div className="text-center py-16">
            <div className="grid grid-cols-3 gap-2 mb-6 max-w-xs mx-auto">
              {photos.slice(0, 3).map(p => (
                <div key={p.id} className="rounded-xl overflow-hidden">
                  <img src={p.dataUrl} alt={p.area} className="w-full aspect-square object-cover" />
                </div>
              ))}
            </div>
            <div className="text-5xl mb-4 animate-bounce">🔍</div>
            <h2 className="text-xl font-bold text-stone-900 mb-2">Finding recipes...</h2>
            <p className="text-stone-400 text-sm">
              {analyzingCount > 0 ? `Analyzing ${analyzingCount} photo${analyzingCount > 1 ? 's' : ''}...` : 'Matching ingredients to recipes'}
            </p>
            <div className="flex items-center justify-center gap-1 mt-4">
              {[0, 1, 2].map(i => (
                <div key={i} className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"
                  style={{ animationDelay: `${i * 200}ms`, opacity: 0.4 + i * 0.2 }} />
              ))}
            </div>
          </div>
        )}

        {/* ── Recipes View ── */}
        {view === 'recipes' && (
          <div>
            <button className="btn-secondary mb-4 text-sm" onClick={reset}>
              ← New search
            </button>

            <div className="mb-4">
              <h2 className="text-xl font-bold text-stone-900 mb-1">Your combined inventory</h2>
              <p className="text-xs text-stone-400 mb-2">
                {photos.length} areas · {allIngredients.length} ingredients
              </p>
              <div className="flex flex-wrap gap-1.5">
                {allIngredients.map(i => (
                  <span key={i} className="tag">{i}</span>
                ))}
              </div>
            </div>

            <div className="h-px bg-stone-200 my-5" />

            <h3 className="font-bold text-stone-800 mb-3">
              {recipes.length} recipes you can make
            </h3>

            {recipes.length === 0 ? (
              <div className="card p-8 text-center">
                <div className="text-4xl mb-3">🤷</div>
                <p className="text-stone-600 font-medium">No exact matches found.</p>
                <p className="text-stone-400 text-xs mt-1">Try adding more ingredients from other areas.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recipes.map(recipe => (
                  <button
                    key={recipe.id}
                    className="card p-4 w-full text-left hover:shadow-md transition-all hover:-translate-y-0.5 cursor-pointer"
                    onClick={() => openRecipeDetail(recipe)}
                  >
                    <div className="flex gap-4">
                      {recipe.image && (
                        <img
                          src={recipe.image}
                          alt={recipe.title}
                          className="w-20 h-20 rounded-xl object-cover flex-shrink-0"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-stone-900 text-sm leading-tight mb-1">{recipe.title}</p>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs font-medium text-emerald-600">
                            {recipe.matchPercent}% match
                          </span>
                          <span className="text-xs text-stone-400">
                            {recipe.usedCount} have · {recipe.missedCount} missing
                          </span>
                        </div>
                        {recipe.missedCount > 0 && (
                          <p className="text-xs text-stone-400">
                            Missing: {recipe.missedIngredients.slice(0, 2).join(', ')}
                            {recipe.missedCount > 2 && ` +${recipe.missedCount - 2} more`}
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Error View ── */}
        {view === 'error' && (
          <div className="text-center py-12">
            <div className="text-5xl mb-4">😅</div>
            <h2 className="text-xl font-bold text-stone-900 mb-2">Couldn't analyze that</h2>
            <p className="text-stone-500 text-sm mb-6">{error}</p>
            <button className="btn-primary max-w-xs mx-auto" onClick={reset}>
              Try again
            </button>
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
                  <img
                    src={selectedRecipe.image}
                    alt={selectedRecipe.title}
                    className="w-full h-48 object-cover rounded-xl mt-3"
                  />
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
                      <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-stone-100 text-stone-600">
                        {ing}
                      </span>
                    ))}
                  </div>
                </div>
                <button
                  onClick={() => openInstacart(selectedRecipe.missedIngredients)}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 text-white font-semibold text-sm hover:from-teal-600 hover:to-emerald-600 transition-all flex items-center justify-center gap-2"
                >
                  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor"><path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.3 2.3c-.6.6-.2 1.7.6 1.7H17M17 17a2 2 0 100-4 2 2 0 000 4zM9 17a2 2 0 100-4 2 2 0 000 4z"/></svg>
                  Buy missing ingredients on Instacart
                </button>
              </div>
            )}

            <div className="p-4">
              {loadingDetail ? (
                <div className="text-center py-8 text-stone-400 text-sm">Loading recipe...</div>
              ) : recipeDetail?.error ? (
                <p className="text-stone-500 text-sm">{recipeDetail.error}</p>
              ) : recipeDetail?.summary ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-4 text-sm text-stone-500">
                    {recipeDetail.info?.readyInMinutes && (
                      <span>⏱ {recipeDetail.info.readyInMinutes} min</span>
                    )}
                    {recipeDetail.info?.servings && (
                      <span>🍽 {recipeDetail.info.servings} servings</span>
                    )}
                  </div>
                  <p className="text-sm text-stone-600 leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: recipeDetail.summary?.replace(/<[^>]+>/g, '') || '' }}
                  />
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
          </div>
        </div>
      )}
    </div>
  )
}
