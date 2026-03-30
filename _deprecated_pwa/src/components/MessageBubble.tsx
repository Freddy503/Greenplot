import { useState } from 'react';
import { Message } from '../types';
import { RatingStars } from './Rating';

interface MessageBubbleProps {
  message: Message;
  onRating?: (messageId: string, rating: { score: number; consent: boolean }) => void;
}

export function MessageBubble({ message, onRating }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const [expandedTool, setExpandedTool] = useState<string | null>(null);

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div className={`max-w-[80%] rounded-2xl p-4 ${isUser ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface'}`}>
        <div className="whitespace-pre-wrap">{message.content}</div>
        {message.toolStatus && !message.toolCalls?.length && (
          <div className="text-xs mt-2 opacity-70 flex items-center gap-1">
            <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
            {message.toolStatus}
          </div>
        )}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {message.toolCalls.map((tc) => {
              const isExpanded = expandedTool === tc.id;
              const statusIcon = tc.status === 'done' ? 'check_circle'
                : tc.status === 'error' ? 'error' : 'progress_activity';
              const statusColor = tc.status === 'done' ? 'text-green-400'
                : tc.status === 'error' ? 'text-red-400' : 'text-yellow-400';
              const toolLabel = tc.name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

              return (
                <div key={tc.id} className="bg-surface-dim/15 rounded-xl overflow-hidden">
                  <button
                    onClick={() => setExpandedTool(isExpanded ? null : tc.id)}
                    className="w-full px-3 py-2 flex items-center gap-2 text-xs hover:bg-surface-dim/10 transition-colors"
                  >
                    <span className={`material-symbols-outlined text-sm ${statusColor} ${tc.status === 'running' ? 'animate-spin' : ''}`}>
                      {statusIcon}
                    </span>
                    <span className="font-medium flex-1 text-left">{toolLabel}</span>
                    {tc.status === 'done' && (
                      <span className="material-symbols-outlined text-sm opacity-40">
                        {isExpanded ? 'expand_less' : 'expand_more'}
                      </span>
                    )}
                  </button>
                  {isExpanded && tc.result && (
                    <div className="px-3 pb-2 text-xs opacity-70 border-t border-outline-variant/10 pt-2">
                      <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed">
                        {(() => {
                          try { return JSON.stringify(JSON.parse(tc.result), null, 2); }
                          catch { return tc.result; }
                        })()}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
            {message.toolStatus && (
              <div className="text-xs opacity-50 flex items-center gap-1 pt-1">
                <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                {message.toolStatus}
              </div>
            )}
          </div>
        )}
        {message.attachments && message.attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {message.attachments.map((att, idx) => (
              <div key={idx} className="text-xs bg-surface-dim/30 rounded-full px-3 py-1 flex items-center gap-1">
                <span className="material-symbols-outlined text-sm">attach_file</span>
                {att.name}
              </div>
            ))}
          </div>
        )}
        {!isUser && !message.ratingSubmitted && onRating && message.id && message.content && !message.toolStatus && (
          <div className="mt-3 border-t border-outline-variant/20 pt-2">
            <RatingStars onRate={(r) => onRating(message.id, r)} />
          </div>
        )}
        {!isUser && message.ratingSubmitted && (
          <div className="mt-2 text-xs opacity-50 flex items-center gap-1">
            <span className="material-symbols-outlined text-sm">thumb_up</span>
            Thanks for the feedback
          </div>
        )}
      </div>
    </div>
  );
}
