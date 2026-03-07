import { useState } from "react"
import { supabase } from "../lib/supabase"

export default function Login() {
  const [email, setEmail] = useState("")
  const [sent, setSent] = useState(false)
  const [error, setError] = useState("")

  const login = async () => {
    setError("")

    if (!supabase) {
      setError("Supabase environment variables are missing.")
      return
    }

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin
      }
    })

    if (error) {
      setError(error.message)
      return
    }

    setSent(true)
  }

  return (
    <div className="page">
      <h1>Login</h1>

      {sent ? (
        <p>Check your email for the login link.</p>
      ) : (
        <>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <button onClick={login}>
            Send Login Link
          </button>

          {error && <p>{error}</p>}
        </>
      )}
    </div>
  )
}
