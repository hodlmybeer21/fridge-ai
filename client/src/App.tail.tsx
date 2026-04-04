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
                    {recipeDetail.info?.readyInMinutes && <span>⏱ {recipeDetail.info.readyInMinutes} min</span>}
                    {recipeDetail.info?.servings && <span>🍽 {recipeDetail.info.servings} servings</span>}
                  </div>
                  <p
                    className="text-sm text-stone-600 leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: (recipeDetail.summary || "").replace(/<[^>]+>/g, "") }}
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
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
