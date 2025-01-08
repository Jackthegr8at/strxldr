import { ThemeToggle } from './ThemeToggle';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuItem } from "@radix-ui/react-dropdown-menu";
import { ChevronDownIcon } from '@heroicons/react/24/outline';

export function Header() {
  return (
    <>
      <header className="bg-white dark:bg-gray-800 shadow-sm">
        <div className="mx-auto grid grid-cols-[1fr,max-content] p-4 items-center sticky top-0 z-50 border-b border-purple-100 dark:border-purple-800">
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <a href="/">
              <img 
                src="/icon-512x512.png" 
                alt="STRX Logo" 
                className="h-8 w-8 md:hidden rounded-lg"
              />
            </a>
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 text-3xl font-bold text-purple-700 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-300">
                  <span className="md:hidden text-2xl">STRX LDRBDS</span>
                  <span className="hidden md:inline">STRX Staking Leaderboard</span>
                  <ChevronDownIcon className="h-5 w-5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent 
                className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-2 min-w-[200px] mt-2 z-50 border border-purple-100 dark:border-purple-800"
                sideOffset={5}
              >
                <DropdownMenuItem className="outline-none">
                  <a 
                    href="https://strxldr.app/"
                    className="block w-full px-4 py-2 hover:bg-purple-50 dark:hover:bg-purple-800 rounded-md text-gray-700 dark:text-gray-200"
                  >
                    STRX Staking Leaderboard
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem className="outline-none">
                  <a 
                    href="https://mint.strxldr.app/"
                    className="block w-full px-4 py-2 hover:bg-purple-50 dark:hover:bg-purple-800 rounded-md text-gray-700 dark:text-gray-200"
                  >
                    STRX LEADERS MINT
                  </a>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <div className="hidden md:block fixed bottom-8 left-8 z-50">
        <a href="/">
          <img 
            src="/icon-512x512.png" 
            alt="STRX Logo" 
            className="w-24 h-24 rounded-lg shadow-lg hover:scale-110 transition-transform duration-200"
          />
        </a>
      </div>
    </>
  );
} 