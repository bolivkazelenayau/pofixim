import ChatContainer from '@/components/ChatContainer';
import ThemeToggle from '@/components/ThemeToggle';

export default function Home() {
  return (
    <main className="flex min-h-dvh w-full px-2 py-2 sm:px-4 sm:py-4">
      <div className="fixed right-3 top-3 z-40">
        <ThemeToggle />
      </div>
      <ChatContainer />
    </main>
  );
}
