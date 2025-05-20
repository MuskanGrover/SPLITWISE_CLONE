import { Inter} from "next/font/google";
import "./globals.css";
import Header from "../components/Header"
import ConvexClientProvider from "../components/convex-client-provider"
import {ClerkProvider} from "@clerk/nextjs"
import { Toaster } from "@/components/ui/sonner";

const inter=Inter({subsets:["latin"]});

export const metadata = {
  title: "Splitr",
  description: "The Smartest way to split expenses with friends",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/logos/logo-s.png" />
      </head>
      <body className={`${inter.className}  antialiased`}>
        <ClerkProvider>
      <ConvexClientProvider>
      
        <Header/>
       <main className="min-h-screen">
         {children}
         <Toaster richColors/>
       </main>
       </ConvexClientProvider>
       </ClerkProvider>
      </body>
    </html>
  );
}
