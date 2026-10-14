CREATE TABLE `content_transition_file_availability_evidence` (
	`transition_id` text NOT NULL,
	`evidence_id` text NOT NULL,
	`observation_json` text NOT NULL,
	PRIMARY KEY(`transition_id`, `evidence_id`),
	FOREIGN KEY (`transition_id`) REFERENCES `content_transitions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "content_file_availability_observation" CHECK(json_valid("content_transition_file_availability_evidence"."observation_json") AND json_type("content_transition_file_availability_evidence"."observation_json")='object')
);
