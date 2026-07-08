import HomeApp from "../../HomeApp";

// Optional catch-all: matches /dashboard and any /dashboard/a/b/c depth. Renders
// the same client app; the client derives the view from the pathname. We don't
// read route params on the server (avoids Next 16 async-params handling).
export default function DashboardCatchAll() {
  return <HomeApp />;
}
