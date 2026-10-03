import "./globals.css";
import type { Metadata } from "next";
export const metadata:Metadata={title:"TREXOR — AI Coding Workspace",description:"Build, code and create with TREXOR."};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="de"><body>{children}</body></html>}
