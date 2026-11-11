import { useEffect, useState } from "react";
export const PHONE_PORTRAIT = "(max-width: 600px) and (orientation: portrait)";
export function usePhonePortrait() {
  const [matches, setMatches] = useState(
    () => window.matchMedia(PHONE_PORTRAIT).matches,
  );
  useEffect(() => {
    const query = window.matchMedia(PHONE_PORTRAIT);
    const update = () => setMatches(query.matches);
    query.addEventListener("change", update);
    update();
    return () => query.removeEventListener("change", update);
  }, []);
  return matches;
}
