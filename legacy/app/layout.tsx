import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'D Loop 3D | Filament Studio',description:'Your spools, printers and remaining filament. One workspace.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
