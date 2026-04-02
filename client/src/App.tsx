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

type View = 'upload' | 'analyzing' | 'recipes' | 'error'

export default function App() {
  const [view, setView] = useState<View>('upload')
  const [imageUrl, setImageUrl] = useState<string>('')
  const [ingredients, setIngredients] = useState<string[]>([])
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [error, setError] = useState('')
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null)
  const [recipeDetail, setRecipeDetail] = useState<any>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Convert file to base64 data URL
  const fileToDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file.')
      setView('error')
      return
    }
    const dataUrl = await fileToDataUrl(file)
    setImageUrl(dataUrl)
    analyzeImage(dataUrl)
  }

  const handleCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  const analyzeImage = async (url: string) => {
    setView('analyzing')
    setError('')
    try {
      // Step 1: Vision AI → ingredients
      const analyzeRes = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: url })
      })
      const analyzeData = await analyzeRes.json()
      if (!analyzeRes.ok) throw new Error(analyzeData.error || 'Analysis failed')
      const ingredientsList = analyzeData.ingredients || []

      if (ingredientsList.length === 0) {
        setError(" couldn't find any ingredients. Try a clearer photo with better lighting.")
        setView('error')
        return
      }

      setIngredients(ingredientsList)

      // Step 2: Spoonacular → recipes
      const recipesRes = await fetch('/api/recipes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ingredients: ingredientsList })
      })
      const recipesData = await recipesRes.json()
      if (!recipesRes.ok) throw new Error(recipesData.error || 'Recipe search failed')

      setRecipes(recipesData.recipes || [])
      setView('recipes')
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.')
      setView('error')
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
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

  const reset = () => {
    setView('upload')
    setImageUrl('')
    setIngredients([])
    setRecipes([])
    setError('')
    setSelectedRecipe(null)
    setRecipeDetail(null)
  }

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
            <div className="text-center py-6">
              <div className="text-6xl mb-4">📸</div>
              <h2 className="text-2xl font-bold text-stone-900 mb-2">Open your fridge</h2>
              <p className="text-stone-500 text-sm">Take a photo of what's inside. We'll find recipes you can make right now.</p>
            </div>

            <div
              className="card p-8 text-center cursor-pointer transition-all hover:border-brand-300 hover:shadow-md"
              onDrop={handleDrop}
              onDragOver={e => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="text-4xl mb-3">🧊</div>
              <p className="font-semibold text-stone-700 mb-1">Drop a fridge photo or click to upload</p>
              <p className="text-xs text-stone-400">JPG, PNG, HEIC — any format</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleCapture}
              />
            </div>

            <button
              className="btn-primary flex items-center justify-center gap-2"
              onClick={() => fileInputRef.current?.click()}
            >
              <span>📷</span> Take a Photo
            </button>

            <div className="flex items-center gap-3 text-stone-400 text-xs text-center">
              <div className="flex-1 h-px bg-stone-200" />
              <span>Works best with fridge door open</span>
              <div className="flex-1 h-px bg-stone-200" />
            </div>

            <div className="card p-4">
              <h3 className="font-semibold text-stone-800 mb-2 text-sm">How it works</h3>
              <ol className="space-y-2 text-xs text-stone-500">
                <li className="flex gap-2"><span className="text-brand-600 font-bold">1.</span> Take a photo of your fridge, pantry, or grocery haul</li>
                <li className="flex gap-2"><span className="text-brand-600 font-bold">2.</span> AI identifies your ingredients instantly</li>
                <li className="flex gap-2"><span className="text-brand-600 font-bold">3.</span> Get recipes matched to what you already have</li>
              </ol>
            </div>
          </div>
        )}

        {/* ── Analyzing View ── */}
        {view === 'analyzing' && (
          <div className="text-center py-16">
            {imageUrl && (
              <div className="rounded-2xl overflow-hidden mb-6 max-h-64 mx-auto">
                <img src={imageUrl} alt="Your fridge" className="w-full object-cover" />
              </div>
            )}
            <div className="text-5xl mb-4 animate-bounce">🔍</div>
            <h2 className="text-xl font-bold text-stone-900 mb-2">Looking in your fridge...</h2>
            <p className="text-stone-400 text-sm mb-6">Identifying ingredients with AI vision</p>
            <div className="flex items-center justify-center gap-1">
              {[0,1,2].map(i => (
                <div key={i} className="w-2 h-2 rounded-full bg-brand-500 animate-pulse"
                  style={{ animationDelay: `${i * 200}ms`, opacity: 0.4 + i * 0.2 }} />
              ))}
            </div>
          </div>
        )}

        {/* ── Recipes View ── */}
        {view === 'recipes' && (
          <div>
            <button className="btn-secondary mb-4 text-sm" onClick={reset}>
              ← New photo
            </button>

            <div className="mb-4">
              <h2 className="text-xl font-bold text-stone-900 mb-1">What you have</h2>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {ingredients.map(i => (
                  <span key={i} className="tag">{i}</span>
                ))}
              </div>
            </div>

            <div className="h-px bg-stone-200 my-5" />

            <h3 className="font-bold text-stone-800 mb-3">{recipes.length} recipes you can make</h3>

            {recipes.length === 0 ? (
              <div className="card p-8 text-center">
                <div className="text-4xl mb-3">🤷</div>
                <p className="text-stone-600 font-medium">No exact matches found.</p>
                <p className="text-stone-400 text-xs mt-1">Try a photo with more ingredients visible.</p>
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
                          <span className="text-xs font-medium text-brand-600">
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
            <h2 className="text-xl font-bold text-stone-900 mb-2">Couldn't analyze that photo</h2>
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
            {/* Modal Header */}
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

            {/* Match Info */}
            <div className="px-4 py-3 bg-brand-50 flex items-center gap-3">
              <div className="flex-1">
                <p className="text-xs text-brand-600 font-medium">Ingredients you have</p>
                <p className="text-sm text-stone-700">
                  {selectedRecipe.usedCount} of {selectedRecipe.usedCount + selectedRecipe.missedCount}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-brand-600 font-medium">Match</p>
                <p className="text-lg font-bold text-brand-600">{selectedRecipe.matchPercent}%</p>
              </div>
            </div>

            {/* Missing Ingredients */}
            {selectedRecipe.missedIngredients.length > 0 && (
              <div className="px-4 py-3 border-b border-stone-100">
                <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-2">You need</p>
                <div className="flex flex-wrap gap-1.5">
                  {selectedRecipe.missedIngredients.map((ing, i) => (
                    <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-stone-100 text-stone-600">
                      {ing}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Recipe Detail */}
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
