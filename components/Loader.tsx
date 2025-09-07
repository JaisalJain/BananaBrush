import React, { useState, useEffect } from 'react';

const MESSAGES = [
  "Applying AI magic...",
  "Polishing pixels...",
  "Consulting the art masters...",
  "Unleashing creativity...",
  "Adding the finishing touches...",
];

const Loader: React.FC<{ message: string }> = ({ message }) => {
  const [displayMessage, setDisplayMessage] = useState(message || MESSAGES[0]);

  useEffect(() => {
    let currentIndex = 0;
    const intervalId = setInterval(() => {
      currentIndex = (currentIndex + 1) % MESSAGES.length;
      setDisplayMessage(MESSAGES[currentIndex]);
    }, 2500);

    return () => clearInterval(intervalId);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center text-center p-8">
      <div className="w-12 h-12 border-4 border-t-indigo-500 border-slate-600 rounded-full animate-spin"></div>
      <p className="mt-4 text-lg font-semibold text-slate-300">{displayMessage}</p>
      <p className="mt-1 text-sm text-slate-400">This may take a moment...</p>
    </div>
  );
};

export default Loader;
