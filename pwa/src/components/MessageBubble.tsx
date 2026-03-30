import { Message } from '../types';
import { RatingStars } from './Rating';

interface MessageBubbleProps {
  message: Message;
  onRating?: (messageId: string, rating: { score: number; consent: boolean }) => void;
}

export function MessageBubble({ message, onRating }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div className={`max-w-[80%] rounded-2xl p-4 ${isUser ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface'}`}>
        <div className="whitespace-pre-wrap">{message.content}</div>
        {message.toolStatus && (
          <div className="text-xs mt-2 opacity-70 flex items-center gap-1">
            <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
            {message.toolStatus}
          </div>
        )}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mt-2 space-y-1">
            {message.toolCalls.map((tc) => (
              <div key={tc.id} className="text-xs bg-surface-dim/20 rounded-lg px-3 py-2 flex items-center gap-2">
                <span className={`material-symbols-outlined text-sm ${
                  tc.status === 'done' ? 'text-green-400' :
                  tc.status === 'error' ? 'text-red-400' : 'text-yellow-400 animate-spin'
                }`}>
                  {tc.status === 'done' ? 'check_circle' : tc.status === 'error' ? 'error' : 'progress_activity'}
                </span>
                <span className="font-medium">{tc.name}</span>
                {tc.result && <span className="opacity-60 truncate">{tc.result}</span>}
              </div>
            ))}
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
        {!isUser && !message.ratingSubmitted && onRating && message.id && (
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
