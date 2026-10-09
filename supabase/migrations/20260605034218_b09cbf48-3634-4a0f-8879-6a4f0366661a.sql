
ALTER TYPE public.contract_status ADD VALUE IF NOT EXISTS 'proyectado' BEFORE 'active';

CREATE TYPE public.project_delivery_type AS ENUM ('proyecto','raas');
CREATE TYPE public.project_state AS ENUM ('planificacion','en_curso','en_riesgo','entregado','cerrado');
CREATE TYPE public.handoff_state AS ENUM ('pendiente','en_planificacion','completado');
CREATE TYPE public.milestone_link_type AS ENUM ('gatilla_facturacion','solo_referencia');
CREATE TYPE public.service_frequency AS ENUM ('mensual','trimestral','semestral','anual','unica','hitos');
CREATE TYPE public.contract_mode AS ENUM ('simple','multiservicio');
