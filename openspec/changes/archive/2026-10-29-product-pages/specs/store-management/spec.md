# Spec Delta

## ADDED Requirements

### Requirement: Product pages that sell

The Store SHALL offer to rewrite a product's page: a title of at most 60 characters with the main keyword first, a hook and three or four benefit lines, using only facts the product already holds, shown next to the current page as a buyer sees it. Approving SHALL queue a `store.listing.edit` action that writes the page to Fourthwall; its undo SHALL write the old page back.

#### Scenario: Rewrite approved

- **WHEN** the designer opens Rewrite product page and chooses Use this page
- **THEN** Fourthwall's product gets the new name and description, and the Store lists the product under its new title

#### Scenario: A rule still broken

- **WHEN** the rewritten title is still over 60 characters after one retry
- **THEN** the dialog says search results cut it, and the designer decides
