import type { Messages } from "@/lib/locale";
import type { PublicRatings } from "@/lib/ratings";

export function PublicRatingSlots({
  ratings,
  t,
  compact,
}: {
  ratings: PublicRatings;
  t: Messages;
  compact?: boolean;
}) {
  const imdb = ratings.imdb == null ? t.ratingUnavailable : String(ratings.imdb);
  const tomato = ratings.tomato == null ? t.ratingUnavailable : `${ratings.tomato}%`;
  return (
    <span className={compact ? "ratings ratings-compact" : "ratings"} aria-label={`${t.ratingImdb} ${imdb}, ${t.ratingTomato} ${tomato}`}>
      <span className="rating-slot">
        <span className="rating-label">{t.ratingImdb}</span>
        <span className="rating-value">{imdb}</span>
      </span>
      <span className="rating-slot">
        <span className="rating-label">{t.ratingTomato}</span>
        <span className="rating-value">{tomato}</span>
      </span>
    </span>
  );
}
