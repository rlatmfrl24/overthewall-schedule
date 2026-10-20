[graphify] MultiDiGraph edge-collapse diagnostic
input: <in-memory>
input_stage: provided JSON (normal graph.json.gz is post-build)
effective_directed: <direct-call>
nodes: 8373
unverified_code_nodes: 0
raw_edges: 41011
valid_candidate_edges: 40799
missing_endpoint_edges: 0
dangling_endpoint_edges: 212
self_loop_edges: 23
exact_duplicate_edges: 9424
directed_unique_endpoint_pairs: 28664
directed_same_endpoint_collapsed_edges: 12135
undirected_unique_endpoint_pairs: 28658
undirected_same_endpoint_collapsed_edges: 12141
same_endpoint_group_count: 3611
relation_variant_groups: 485
source_file_variant_groups: 0
source_location_variant_groups: 590
context_variant_groups: 8
post_build_graph_type: Graph
post_build_edges: 28655
producer_suppression_sites: 12
producer_suppression_examples:
  - L1337 seen_ids arity=unknown
  - L1870 seen_ids arity=unknown
  - L1872 seen_doc_refs arity=unknown
  - L2242 seen_ids arity=unknown
  - L2389 seen_ids arity=unknown
  - L3027 seen_keys arity=unknown
  - L3196 seen_keys arity=unknown
  - L4900 seen_ids arity=unknown
examples:
  - drizzle_0126_admitted_channel_dependency_capture_content_transition_admitted_dependencies -> drizzle_0046_tan_nova_music_entities edges=23 relations=['reads_from'] locations=['L464', 'L466'] contexts=['']
  - drizzle_0127_original_proposal_event_capture_content_transition_admitted_dependencies -> drizzle_0046_tan_nova_music_entities edges=23 relations=['reads_from'] locations=['L464', 'L466'] contexts=['']
  - drizzle_0128_member_submission_event_capture_content_transition_admitted_dependencies -> drizzle_0046_tan_nova_music_entities edges=23 relations=['reads_from'] locations=['L464', 'L466'] contexts=['']
  - drizzle_0103_content_transition_capture_content_transition_affected_roots -> drizzle_0046_tan_nova_music_entities edges=22 relations=['reads_from'] locations=['L104', 'L113', 'L129', 'L160', 'L161', 'L172', 'L177', 'L179', 'L181', 'L187', 'L195', 'L201', 'L202', 'L203', 'L205', 'L206', 'L81', 'L86', 'L89', 'L93', 'L94'] contexts=['']
  - drizzle_0103_content_transition_capture_content_transition_live_membership -> drizzle_0046_tan_nova_music_entities edges=22 relations=['reads_from'] locations=['L232', 'L233', 'L234', 'L236', 'L237', 'L260', 'L265', 'L268', 'L272', 'L273', 'L283', 'L292', 'L308', 'L339', 'L340', 'L351', 'L356', 'L358', 'L360', 'L366', 'L374'] contexts=['']
note: normal graph.json.gz is post-build; raw producer loss must be measured earlier.