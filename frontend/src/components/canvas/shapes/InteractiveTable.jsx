import React, { useMemo, useState, useRef, useEffect } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender
} from '@tanstack/react-table';
import { List } from 'react-window';
import './InteractiveTable.css';

/**
 * Interactive Table Component with TanStack Table
 * Features: sorting, filtering, pagination, and virtualization for large datasets
 */
export function InteractiveTable({ headers, rows, totalRows, width, height }) {
  const containerRef = useRef(null);
  const [globalFilter, setGlobalFilter] = useState('');
  const [sorting, setSorting] = useState([]);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 50 });

  // Convert row arrays to objects for TanStack Table
  const data = useMemo(() => {
    if (!headers || !rows) return [];
    return rows.map(row => {
      const rowObj = {};
      headers.forEach((header, index) => {
        rowObj[header] = row[index];
      });
      return rowObj;
    });
  }, [headers, rows]);

  // Define columns from headers
  const columns = useMemo(() => {
    if (!headers) return [];
    return headers.map(header => ({
      accessorKey: header,
      header: header,
      cell: info => {
        const value = info.getValue();
        return value !== null && value !== undefined ? String(value) : '—';
      },
      enableSorting: true,
      enableGlobalFilter: true
    }));
  }, [headers]);

  // Initialize table
  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      globalFilter,
      pagination
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    globalFilterFn: 'includesString'
  });

  // Determine if virtualization is needed (for very large datasets after filtering)
  const paginatedRows = table.getRowModel().rows;
  const shouldVirtualize = paginatedRows.length > 100;

  // Setup scroll isolation
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e) => {
      e.stopPropagation();
      
      const { scrollTop, scrollHeight, clientHeight } = container;
      const isAtTop = scrollTop === 0 && e.deltaY < 0;
      const isAtBottom = scrollTop + clientHeight >= scrollHeight && e.deltaY > 0;
      
      if (isAtTop || isAtBottom) {
        e.preventDefault();
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  // Stop propagation for all pointer events
  const stopPropagation = (e) => e.stopPropagation();

  // Calculate available height for table content
  const filterBarHeight = 50;
  const paginationHeight = 50;
  const headerHeight = 40;
  const availableHeight = height - filterBarHeight - paginationHeight - headerHeight;
  
  // Row renderer for virtualized list
  const VirtualRow = ({ index, style }) => {
    const row = paginatedRows[index];
    return (
      <div style={{ ...style, display: 'table', width: '100%', tableLayout: 'fixed' }}>
        <div style={{ display: 'table-row' }} className="table-row">
          {row.getVisibleCells().map(cell => (
            <div 
              key={cell.id} 
              style={{ display: 'table-cell' }}
              className="table-cell"
            >
              {flexRender(cell.column.columnDef.cell, cell.getContext())}
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div 
      className="interactive-table-container"
      onPointerDown={stopPropagation}
      onClick={stopPropagation}
      onMouseDown={stopPropagation}
      onMouseMove={stopPropagation}
      onDoubleClick={stopPropagation}
      style={{ 
        height: '100%',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      {/* Global Filter Bar */}
      <div className="table-filter-bar">
        <input
          type="text"
          value={globalFilter ?? ''}
          onChange={e => setGlobalFilter(e.target.value)}
          placeholder="Search all columns..."
          className="table-search-input"
          onClick={stopPropagation}
          onFocus={stopPropagation}
        />
        <span className="table-filter-info">
          {table.getFilteredRowModel().rows.length} of {data.length} rows
        </span>
      </div>

      {/* Table */}
      <div 
        ref={containerRef}
        className="table-scroll-container"
        style={{ 
          flex: 1,
          overflow: 'auto',
          minHeight: 0
        }}
      >
        <table className="interactive-table">
          <thead className="table-header">
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map(header => (
                  <th
                    key={header.id}
                    onClick={header.column.getToggleSortingHandler()}
                    className="table-header-cell"
                    style={{ cursor: header.column.getCanSort() ? 'pointer' : 'default' }}
                  >
                    <div className="table-header-content">
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                      {header.column.getCanSort() && (
                        <span className="sort-indicator">
                          {{
                            asc: ' ▲',
                            desc: ' ▼',
                          }[header.column.getIsSorted()] ?? ' ⬍'}
                        </span>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {shouldVirtualize ? (
              // For large datasets, use virtual scrolling
              <tr>
                <td colSpan={columns.length} style={{ padding: 0 }}>
                  <List
                    height={Math.min(availableHeight, paginatedRows.length * 37)}
                    itemCount={paginatedRows.length}
                    itemSize={37}
                    width="100%"
                    style={{ overflowX: 'hidden' }}
                  >
                    {VirtualRow}
                  </List>
                </td>
              </tr>
            ) : (
              // Standard rendering for smaller datasets
              paginatedRows.map(row => (
                <tr key={row.id} className="table-row">
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id} className="table-cell">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>

        {paginatedRows.length === 0 && (
          <div className="table-empty-state">
            {globalFilter ? 'No matching results found' : 'No data available'}
          </div>
        )}
      </div>

      {/* Pagination Controls */}
      <div className="table-pagination">
        <div className="pagination-info">
          Page {table.getState().pagination.pageIndex + 1} of{' '}
          {table.getPageCount()}
        </div>
        
        <div className="pagination-controls">
          <button
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}
            className="pagination-button"
          >
            {'<<'}
          </button>
          <button
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            className="pagination-button"
          >
            {'<'}
          </button>
          <button
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            className="pagination-button"
          >
            {'>'}
          </button>
          <button
            onClick={() => table.setPageIndex(table.getPageCount() - 1)}
            disabled={!table.getCanNextPage()}
            className="pagination-button"
          >
            {'>>'}
          </button>
        </div>

        <select
          value={table.getState().pagination.pageSize}
          onChange={e => table.setPageSize(Number(e.target.value))}
          className="pagination-select"
          onClick={stopPropagation}
        >
          {[10, 25, 50, 100].map(pageSize => (
            <option key={pageSize} value={pageSize}>
              Show {pageSize}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

