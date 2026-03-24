import { LogIn, LogOut, User, Key, CreditCard, Zap } from "lucide-react";
import { useAuth } from "@workspace/replit-auth-web";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function Header() {
  const { user, isLoading, isAuthenticated, login, logout } = useAuth();

  const initials = user
    ? [user.firstName, user.lastName]
        .filter(Boolean)
        .map((n) => n![0])
        .join("")
        .toUpperCase() || user.email?.[0]?.toUpperCase() || "?"
    : "?";

  return (
    <header className="h-12 border-b border-border/60 bg-background/80 backdrop-blur-sm flex items-center justify-between px-4 flex-shrink-0 z-50">
      <div className="flex items-center gap-2">
        <Zap className="w-4 h-4 text-violet-500" />
        <span className="text-sm font-semibold text-foreground">AI Studio</span>
      </div>

      <nav className="flex items-center gap-1">
        <Link href="/">
          <Button variant="ghost" size="sm" className="text-xs h-7">
            Studio
          </Button>
        </Link>
        {isAuthenticated && (
          <>
            <Link href="/keys">
              <Button variant="ghost" size="sm" className="text-xs h-7">
                <Key className="w-3 h-3 mr-1" />
                API Keys
              </Button>
            </Link>
            <Link href="/billing">
              <Button variant="ghost" size="sm" className="text-xs h-7">
                <CreditCard className="w-3 h-3 mr-1" />
                Billing
              </Button>
            </Link>
          </>
        )}
      </nav>

      <div className="flex items-center gap-2">
        {isLoading ? (
          <div className="w-7 h-7 rounded-full bg-muted animate-pulse" />
        ) : isAuthenticated ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="p-0 h-7 w-7 rounded-full">
                <Avatar className="h-7 w-7">
                  <AvatarImage src={user?.profileImageUrl ?? undefined} />
                  <AvatarFallback className="text-xs bg-violet-600 text-white">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                {user?.email ?? `${user?.firstName} ${user?.lastName}`.trim()}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/keys">
                  <Key className="w-3.5 h-3.5 mr-2" />
                  API Keys
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/billing">
                  <CreditCard className="w-3.5 h-3.5 mr-2" />
                  Billing
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive">
                <LogOut className="w-3.5 h-3.5 mr-2" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button size="sm" className="h-7 text-xs gap-1.5" onClick={login}>
            <LogIn className="w-3 h-3" />
            Log in
          </Button>
        )}
      </div>
    </header>
  );
}
