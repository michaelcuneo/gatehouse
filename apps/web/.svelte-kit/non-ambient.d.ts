
// this file is generated — do not edit it


declare module "svelte/elements" {
	export interface HTMLAttributes<T> {
		'data-sveltekit-keepfocus'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-noscroll'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-preload-code'?:
			| true
			| ''
			| 'eager'
			| 'viewport'
			| 'hover'
			| 'tap'
			| 'off'
			| undefined
			| null;
		'data-sveltekit-preload-data'?: true | '' | 'hover' | 'tap' | 'off' | undefined | null;
		'data-sveltekit-reload'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-replacestate'?: true | '' | 'off' | undefined | null;
	}
}

export {};


declare module "$app/types" {
	type MatcherParam<M> = M extends (param : string) => param is (infer U extends string) ? U : string;

	export interface AppTypes {
		RouteId(): "/" | "/admin" | "/admin/endpoints" | "/deployments" | "/infrastructure" | "/infrastructure/endpoints" | "/infrastructure/resources" | "/infrastructure/resources/[id]" | "/infrastructure/[section]" | "/operations" | "/operations/errors" | "/operations/logs" | "/projects" | "/p" | "/p/[project]" | "/p/[project]/[stage]" | "/p/[project]/[stage]/errors" | "/p/[project]/[stage]/logs" | "/runtime" | "/runtime/generated" | "/runtime/providers" | "/runtime/reconciliation";
		RouteParams(): {
			"/infrastructure/resources/[id]": { id: string };
			"/infrastructure/[section]": { section: string };
			"/p/[project]": { project: string };
			"/p/[project]/[stage]": { project: string; stage: string };
			"/p/[project]/[stage]/errors": { project: string; stage: string };
			"/p/[project]/[stage]/logs": { project: string; stage: string }
		};
		LayoutParams(): {
			"/": { id?: string | undefined; section?: string | undefined; project?: string | undefined; stage?: string | undefined };
			"/admin": Record<string, never>;
			"/admin/endpoints": Record<string, never>;
			"/deployments": Record<string, never>;
			"/infrastructure": { id?: string | undefined; section?: string | undefined };
			"/infrastructure/endpoints": Record<string, never>;
			"/infrastructure/resources": { id?: string | undefined };
			"/infrastructure/resources/[id]": { id: string };
			"/infrastructure/[section]": { section: string };
			"/operations": Record<string, never>;
			"/operations/errors": Record<string, never>;
			"/operations/logs": Record<string, never>;
			"/projects": Record<string, never>;
			"/p": { project?: string | undefined; stage?: string | undefined };
			"/p/[project]": { project: string; stage?: string | undefined };
			"/p/[project]/[stage]": { project: string; stage: string };
			"/p/[project]/[stage]/errors": { project: string; stage: string };
			"/p/[project]/[stage]/logs": { project: string; stage: string };
			"/runtime": Record<string, never>;
			"/runtime/generated": Record<string, never>;
			"/runtime/providers": Record<string, never>;
			"/runtime/reconciliation": Record<string, never>
		};
		Pathname(): "/" | "/admin/endpoints" | "/deployments" | "/infrastructure/endpoints" | "/infrastructure/resources" | `/infrastructure/resources/${string}` & {} | `/infrastructure/${string}` & {} | "/operations/errors" | "/operations/logs" | "/projects" | `/p/${string}/${string}` & {} | `/p/${string}/${string}/errors` & {} | `/p/${string}/${string}/logs` & {} | "/runtime/generated" | "/runtime/providers" | "/runtime/reconciliation";
		ResolvedPathname(): `${"" | `/${string}`}${ReturnType<AppTypes['Pathname']>}`;
		Asset(): "/robots.txt" | string & {};
	}
}