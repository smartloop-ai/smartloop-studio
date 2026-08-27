import { ReactNode } from 'react';
import { Box, IconButton } from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { DocumentsSectionState } from './use-project-documents';

/**
 * Documents for the current project — the folder listing merged with what the
 * backend has indexed, plus the drop zone that adds more.
 *
 * Pure view. The uploads, the folder scan and the status reconciliation live in
 * `useProjectDocuments`, which the sidebar owns so a file keeps uploading after
 * you close the section.
 */
interface DocumentsPanelProps {
  docs: DocumentsSectionState;
  /** Deleting a document is the parent's business — it owns the project payload. */
  onDeleteDocument: (doc: any) => void;
  /** Only used to tell "no project selected" from "project with no documents". */
  project: any;
  /** The active theme's document glyph, supplied by the shell. */
  docIcon: (size?: number) => ReactNode;
}

export default function DocumentsPanel({ docs, project, onDeleteDocument, docIcon }: DocumentsPanelProps) {
  return (
  <div
    onDragOver={docs.handleDragOver}
    onDragLeave={docs.handleDragLeave}
    onDrop={docs.handleDrop}
  >
    {project ? (
      <div className="space-y-3">
        <input
          ref={docs.fileInputRef}
          type="file"
          accept=".pdf,.docx,.txt,.md"
          multiple
          onChange={docs.handleFileSelect}
          className="hidden"
        />

        {docs.uploadError && (
          <Box className="text-red-400 text-xs px-2 py-1">{docs.uploadError}</Box>
        )}

        {/* Drop zone */}
        <Box
          onClick={() => docs.fileInputRef.current?.click()}
          sx={{
            borderRadius: '8px',
            border: `1px dashed ${docs.isDragging ? 'var(--sl-brand-primary)' : 'var(--sl-border-subtle)'}`,
            bgcolor: docs.isDragging ? 'var(--sl-brand-alpha-10)' : 'transparent',
            transition: 'border-color 0.15s ease, background 0.15s ease',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            gap: 0.75,
            py: 4,
            px: 3,
            '&:hover': {
              borderColor: 'var(--sl-brand-primary)',
              bgcolor: 'var(--sl-brand-alpha-5)',
            },
          }}
        >
          {/* Themed document glyph — files are indexed locally, so a
              document icon fits better than a cloud upload. */}
          <span style={{ color: docs.isDragging ? 'var(--sl-brand-primary)' : 'var(--sl-text-faint)' }}>
            {docIcon(24)}
          </span>
          <span className="text-[12px] text-sl-text-muted font-medium">
            {docs.isDragging ? 'Drop files here' : 'Drop files or click to add'}
          </span>
          <span className="flex items-center gap-1.5 mt-1">
            {['PDF', 'DOCX', 'TXT'].map((type) => (
              <span
                key={type}
                className="text-[9px] font-medium tracking-wide px-2 py-0.5 rounded"
                style={{
                  color: 'var(--sl-text-muted)',
                  backgroundColor: 'var(--sl-white-alpha-7)',
                  border: '1px solid var(--sl-border-subtle)',
                }}
              >
                {type}
              </span>
            ))}
          </span>
        </Box>

        {/* Document List — card style, matching the Models panel */}
        {docs.documents.length > 0 && (
          <Box sx={{ mt: 3, display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {docs.documents
              .map((doc: any, i: number) => {
                const rowId = doc.id || `doc-${i}`;
                // Use filesystem file info when available for original name/size
                const fsFile = doc._fsFile;
                const rawName = fsFile?.name
                  || doc.filename || doc.name
                  || (doc.source || doc.path || '').split('/').pop()
                  || '';
                const filename = rawName ? (rawName.replace(/\.[^/.]+$/, '') || 'Untitled') : 'Untitled';
                const ext = rawName.match(/\.([^/.]+)$/)?.[1]?.toUpperCase() || '';
                const fileSize = fsFile?.size || doc.size || doc.file_size;
                const fileSizeLabel = fileSize != null
                  ? fileSize >= 1024 * 1024 ? `${(fileSize / 1024 / 1024).toFixed(1)} MB` : `${(fileSize / 1024).toFixed(0)} KB`
                  : null;
                const isFsOnly = typeof doc.id === 'string' && doc.id.startsWith('fs-');
                const docIndexStatus = docs.indexingStatus[doc.id];
                const isIndexing = docIndexStatus === 'indexing';
                const converting = docIndexStatus === 'converting';
                const isProcessing = docs.processingDocs.has(doc.id) || isIndexing || converting;

                const rawSummary = !isProcessing
                  ? (doc.markdown
                    ? (() => {
                      // Extract first non-empty paragraph from markdown
                      const para = doc.markdown
                        .replace(/^---[\s\S]*?---\n?/, '')
                        .split(/\n{2,}/)
                        .map((p: string) => p.replace(/^#{1,6}\s+/gm, '').replace(/(\*\*|__)(.*?)\1/g, '$2').replace(/(\*|_)(.*?)\1/g, '$2').replace(/`[^`]*`/g, '').replace(/!\[.*?\]\(.*?\)/g, '').replace(/\[([^\]]+)\]\(.*?\)/g, '$1').replace(/^\s*[-*+>]\s*/gm, '').replace(/\s+/g, ' ').trim())
                        .find((p: string) => p.length > 20);
                      return para || null;
                    })()
                    : null)
                  : "document is being processed";
                const summary = rawSummary
                  ? rawSummary.trim().slice(0, 120)
                  : null;
                return (
                  <Box
                    key={rowId}
                    onClick={() => {
                      const filePath = doc._fsFile?.path || doc.source || doc.path;
                      if (filePath && window.electronAPI?.showItemInFolder) {
                        window.electronAPI.showItemInFolder(filePath);
                      }
                    }}
                    className="rounded-xl"
                    sx={{
                      padding: '12px 14px',
                      cursor: 'pointer',
                      display: 'flex',
                      gap: 1.25,
                      transition: 'box-shadow 0.15s ease',
                      border: '1px solid var(--sl-border-subtle)',
                      bgcolor: 'transparent',
                      '&:hover': { boxShadow: 'inset 0 0 0 1px var(--sl-brand-alpha-30)' },
                    }}
                  >
                    {/* Themed document glyph — matches the sidebar rail */}
                    <span className="flex items-center justify-center flex-shrink-0" style={{ width: 22, height: 22, marginTop: 1, color: 'var(--sl-brand-primary)' }}>
                      {docIcon(18)}
                    </span>
                    <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <span className="text-[13px] font-bold text-sl-text-primary truncate flex-1">
                          {filename}
                        </span>
                        <IconButton
                          size="small"
                          onClick={(e) => { e.stopPropagation(); onDeleteDocument(doc); }}
                          sx={{
                            color: 'var(--sl-text-faint)',
                            padding: '2px',
                            '&:hover': { color: 'var(--sl-status-error)' },
                          }}
                        >
                          <DeleteOutlineIcon sx={{ fontSize: 12 }} />
                        </IconButton>
                      </Box>
                      {!isProcessing && summary && (
                        <span className="text-[12px] text-sl-text-muted leading-relaxed" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }}>
                          {summary}
                        </span>
                      )}
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap', mt: '2px' }}>
                        {ext && (
                          <span
                            className="px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide"
                            style={{ border: '1px solid var(--sl-border-default)', color: 'var(--sl-text-faint)' }}
                          >
                            {ext}
                          </span>
                        )}
                        {(() => {
                          const status = isFsOnly ? 'local' : (docIndexStatus || 'pending');
                          if (status === 'indexed') {
                            const processedAt = docs.processedDates[doc.id];
                            let timeLabel = 'Indexed';
                            if (processedAt) {
                              const diffMs = Date.now() - new Date(processedAt).getTime();
                              const diffMin = Math.floor(diffMs / 60000);
                              const diffHr = Math.floor(diffMin / 60);
                              const diffDay = Math.floor(diffHr / 24);
                              if (diffMin < 1) timeLabel = 'Just now';
                              else if (diffMin < 60) timeLabel = `${diffMin}m ago`;
                              else if (diffHr < 24) timeLabel = `${diffHr}h ago`;
                              else if (diffDay < 30) timeLabel = `${diffDay}d ago`;
                              else timeLabel = new Date(processedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                            }
                            // Success — outlined green, matching the label style guide.
                            return (
                              <span
                                className="px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide"
                                style={{ border: '1px solid rgba(52,211,153,0.3)', color: 'rgb(52,211,153)' }}
                              >
                                {timeLabel}
                              </span>
                            );
                          }
                          // Distinct colors per state — outlined (border at ~30% of the text color), never filled.
                          const statusColor: Record<string, string> = {
                            local: 'rgb(139,139,245)',
                            indexing: 'rgb(250,204,21)',
                            converting: 'rgb(250,204,21)',
                            processing: 'rgb(250,204,21)',
                            pending: 'rgb(148,163,184)',
                            unknown: 'rgb(148,163,184)',
                            failed: 'rgb(248,113,113)',
                            error: 'rgb(248,113,113)',
                          };
                          const c = statusColor[status] || statusColor.pending;
                          const border = c.replace('rgb(', 'rgba(').replace(')', ',0.3)');
                          const label = status === 'failed' || status === 'error' ? 'Failed' : status === 'unknown' ? 'Pending' : status.charAt(0).toUpperCase() + status.slice(1);
                          return (
                            <span
                              className="px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide"
                              style={{ border: `1px solid ${border}`, color: c }}
                            >
                              {label}
                            </span>
                          );
                        })()}
                        {fileSizeLabel && (
                          <span style={{ fontSize: '9px', color: 'var(--sl-text-faint)' }}>{fileSizeLabel}</span>
                        )}
                      </Box>
                    </Box>
                  </Box>
                );
              })}
          </Box>
        )}
      </div>
    ) : (
      <Box className="text-sl-text-disabled text-xs py-4 text-center">
        Select a project to view documents
      </Box>
    )}
  </div>
  );
}
