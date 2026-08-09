-- A small shop schema, in the shape pg_dump writes one.
SET statement_timeout = 0;
SET client_encoding = 'UTF8';

CREATE TABLE public.customers (
    id bigint NOT NULL,
    email character varying(255) NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.orders (
    id bigint NOT NULL,
    customer_id bigint NOT NULL,
    total numeric(10, 2) NOT NULL,
    note text DEFAULT 'none; really'
);

CREATE TABLE public.order_lines (
    order_id bigint NOT NULL,
    sku text NOT NULL,
    qty integer NOT NULL
);

ALTER TABLE ONLY public.customers ADD CONSTRAINT customers_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.customers ADD CONSTRAINT customers_email_key UNIQUE (email);
ALTER TABLE ONLY public.orders ADD CONSTRAINT orders_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.order_lines ADD CONSTRAINT order_lines_pkey PRIMARY KEY (order_id, sku);
ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_customer_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);
ALTER TABLE ONLY public.order_lines
    ADD CONSTRAINT order_lines_order_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id);

COMMENT ON COLUMN public.orders.total IS 'including tax';
