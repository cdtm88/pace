/**
 * AuthCard — shared layout wrapper for login and signup screens (UI-SPEC).
 *
 * Renders:
 *   - Full-viewport zinc-950 background (bg-background, set globally via .dark)
 *   - Vertically and horizontally centered single column
 *   - "Pace" wordmark above the card (28px/700, zinc-50) — UI-SPEC §Typography Display
 *   - zinc-900 card with 32px padding (p-8), max-w-sm — UI-SPEC §Layout
 *
 * Color mapping (UI-SPEC §Color):
 *   - Page bg: bg-background (#09090b zinc-950)
 *   - Card bg: bg-card (#18181b zinc-900) — via shadcn Card component
 *   - Wordmark: text-foreground (#fafafa zinc-50)
 */
import { Card, CardContent } from "@/components/ui/card";
import { COPY } from "@/lib/copy";

interface AuthCardProps {
  children: React.ReactNode;
}

export function AuthCard({ children }: AuthCardProps) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 py-12">
      {/* Wordmark — 28px/700, zinc-50, above card (UI-SPEC §Typography Display) */}
      <p className="mb-6 text-[28px] font-bold leading-[1.1] tracking-tight text-foreground">
        {COPY.WORDMARK}
      </p>

      {/* Auth card — max-w-sm, zinc-900 bg, 32px padding (UI-SPEC §Layout) */}
      <Card className="w-full max-w-sm bg-card">
        <CardContent className="p-8">
          {children}
        </CardContent>
      </Card>
    </div>
  );
}
