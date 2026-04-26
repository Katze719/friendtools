import type { Trip } from "../../api/types";

/** True when the trip has no destinations and no start/end dates saved yet. */
export function needsTripInfoSetup(trip: Trip): boolean {
  return (
    (trip.destinations?.length ?? 0) === 0 &&
    !trip.start_date &&
    !trip.end_date
  );
}
