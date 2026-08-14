import { usePerformance } from '@/hooks/usePerformance.ts'

export function PerformancePanel() {
  const { tracker, downloadReport } = usePerformance()
  const report = tracker.exportReport()

  return (
    <aside className="fixed bottom-4 right-4 z-50 w-80 rounded-xl border border-gray-200 bg-white p-4 shadow-lg">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">Performance</h2>
        <button
          type="button"
          onClick={downloadReport}
          className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700"
        >
          Download Report
        </button>
      </div>

      {report.phases.length === 0 ? (
        <p className="text-xs text-gray-500">No phases recorded yet.</p>
      ) : (
        <ul className="max-h-48 space-y-1 overflow-auto">
          {report.phases.map((phase) => (
            <li
              key={phase.name}
              className="flex items-center justify-between rounded-md bg-gray-50 px-2 py-1 text-xs"
            >
              <span className="font-medium text-gray-700">{phase.name}</span>
              <span className="text-gray-500">
                {phase.duration !== undefined
                  ? `${phase.duration.toFixed(2)} ms`
                  : 'running'}
              </span>
            </li>
          ))}
        </ul>
      )}

      {report.totalDuration !== undefined && (
        <div className="mt-3 border-t border-gray-100 pt-2 text-xs text-gray-600">
          Total: <span className="font-medium">{report.totalDuration.toFixed(2)} ms</span>
        </div>
      )}
    </aside>
  )
}
