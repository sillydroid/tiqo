-- ==============================================================================
-- TIKO: Remove assigned seating requirement from all events
-- ==============================================================================

-- 1. Ensure all existing events use general_admission ticketing model
UPDATE public.events 
SET seating_model = 'general_admission';

-- 2. Ensure default seating model is always general_admission
ALTER TABLE public.events 
ALTER COLUMN seating_model SET DEFAULT 'general_admission';
