import { useState } from 'react';
import { Rating } from '../types';

interface RatingProps {
  onRate: (rating: Rating) => void;
  disabled?: boolean;
}

export function RatingStars({ onRate, disabled }: RatingProps) {
  const [hover, setHover] = useState(0);
  const [consent, setConsent] = useState(false);

  return (
    <div className="flex flex-col gap-2 mt-2">
      <div className="flex gap-1">
        {[1,2,3,4,5].map((star) => (
          <button
            key={star}
            type="button"
            disabled={disabled}
            onClick={() => onRate({ score: star, consent })}
            onMouseEnter={() => setHover(star)}
            onMouseLeave={() => setHover(0)}
            className="text-2xl focus:outline-none"
          >
            <span className="material-symbols-outlined" style={{
              color: star <= (hover || 0) ? '#f8a010' : undefined,
              fontVariationSettings: star <= (hover || 0) ? "'FILL' 1" : "'FILL' 0"
            }}>
              star
            </span>
          </button>
        ))}
      </div>
      <label className="flex items-center gap-2 text-xs text-on-surface-variant">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          disabled={disabled}
        />
        Allow use for improvement
      </label>
    </div>
  );
}
