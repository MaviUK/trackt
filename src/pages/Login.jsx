import { useState } from "react"
import { supabase } from "../lib/supabase"

export default function Login() {

  const [email,setEmail] = useState("")
  const [sent,setSent] = useState(false)

  const login = async () => {

    await supabase.auth.signInWithOtp({
      email: email,
      options:{
        emailRedirectTo: window.location.origin
      }
    })

    setSent(true)
  }

  return (
    <div>

      <h1>Login</h1>

      {sent ? (
        <p>Check your email for the login link.</p>
      ) : (
        <>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e)=>setEmail(e.target.value)}
          />

          <button onClick={login}>
            Send Login Link
          </button>
        </>
      )}

    </div>
  )
}
