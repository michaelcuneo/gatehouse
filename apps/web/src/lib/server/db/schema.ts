export interface EndpointRow {
	id: string;

	name: string;

	type: 'reverse_proxy' | 'static';

	enabled: number;

	spec: string;

	created_at: string;

	updated_at: string;
}
