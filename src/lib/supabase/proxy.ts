import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  // IMPORTANTE: Nunca adicionar código entre createServerClient e supabase.auth.getUser()
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // Rotas públicas que não necessitam de autenticação
  const isLoginPage = pathname === "/login" || pathname.startsWith("/login/");
  const isPublicApp = pathname === "/atendimento" || pathname.startsWith("/atendimento");
  const isPublicApi = 
    pathname.startsWith("/api/print") ||
    pathname.startsWith("/api/products") ||
    pathname.startsWith("/api/orders") ||
    pathname.startsWith("/api/tabs") ||
    pathname.startsWith("/api/sales") ||
    pathname.startsWith("/api/stock") ||
    pathname.startsWith("/api/a-prazo");
  const isApiRoute = pathname.startsWith("/api/");

  // Se o usuário NÃO está autenticado e tenta acessar qualquer página restrita
  if (!user && !isLoginPage && !isPublicApp && !isPublicApi) {
    if (isApiRoute) {
      return NextResponse.json(
        { error: "Acesso não autorizado. Faça login primeiro." },
        { status: 401 }
      );
    }

    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    // Guarda a URL de destino para redirecionar após o login se necessário
    if (pathname !== "/") {
      redirectUrl.searchParams.set("redirectTo", pathname);
    }
    return NextResponse.redirect(redirectUrl);
  }

  // Se o usuário JÁ está autenticado e tenta acessar /login, manda para o dashboard
  if (user && isLoginPage) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/dashboard";
    return NextResponse.redirect(redirectUrl);
  }

  return supabaseResponse;
}
