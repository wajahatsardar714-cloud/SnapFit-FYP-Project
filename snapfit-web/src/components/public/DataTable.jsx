/**
 * The site's one table style: deep-blue header with white text, alternating
 * white / soft-grey rows. Below md each row becomes a stacked card with the
 * column label above every value -- the table never scrolls sideways.
 *   columns  [{ key, label, render?(row) }] -- `render` defaults to row[key]
 *   rows     array of row objects
 *   caption  accessible table caption (visually hidden)
 *   rowKey   (row, index) => unique key; defaults to the index
 */
function DataTable({ columns, rows, caption, rowKey = (row, index) => index }) {
  return (
    <div className="min-w-0 md:overflow-hidden md:rounded-xl md:border md:border-border md:shadow-card">
      <table className="block w-full md:table md:table-fixed">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead className="hidden bg-deep-blue md:table-header-group">
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col" className="type-label px-6 py-4 text-left uppercase tracking-wider text-inverse">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="block space-y-4 md:table-row-group md:space-y-0">
          {rows.map((row, index) => (
            <tr
              key={rowKey(row, index)}
              className="block overflow-hidden rounded-xl border border-border bg-surface shadow-card md:table-row md:rounded-none md:border-0 md:shadow-none md:even:bg-surface-2"
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className="block break-words border-t border-border px-5 py-4 align-top text-body first:border-t-0 md:table-cell md:border-t md:px-6 md:first:border-t"
                >
                  <span data-slot="cell-label" className="type-label mb-1 block text-deep-blue md:hidden">
                    {column.label}
                  </span>
                  {column.render ? column.render(row) : row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default DataTable;
