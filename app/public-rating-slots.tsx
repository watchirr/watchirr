import type { Messages } from "@/lib/locale";
import type { PublicRatings } from "@/lib/ratings";

export function PublicRatingSlots({
  ratings,
  t,
  compact,
  loading,
}: {
  ratings: PublicRatings;
  t: Messages;
  compact?: boolean;
  loading?: boolean;
}) {
  const imdb = loading ? t.ratingLoading : ratings.imdb == null ? t.ratingUnavailable : String(ratings.imdb);
  const tomato = loading ? t.ratingLoading : ratings.tomato == null ? t.ratingUnavailable : `${ratings.tomato}%`;
  const cls = compact ? "ratings ratings-compact" : "ratings";
  return (
    <span
      className={loading ? `${cls} is-loading` : cls}
      aria-busy={loading || undefined}
      aria-label={`${t.ratingImdb} ${imdb}, ${t.ratingTomato} ${tomato}`}
    >
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
