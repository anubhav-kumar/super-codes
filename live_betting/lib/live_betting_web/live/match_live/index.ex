defmodule LiveBettingWeb.MatchLive.Index do
  use LiveBettingWeb, :live_view

  alias LiveBetting.Matches

  @impl true
  def render(assigns) do
    ~H"""
    <Layouts.app flash={@flash}>
      <.header>
        Listing Matches
        <:actions>
          <.button variant="primary" navigate={~p"/matches/new"}>
            <.icon name="hero-plus" /> New Match
          </.button>
        </:actions>
      </.header>

      <.table
        id="matches"
        rows={@streams.matches}
        row_click={fn {_id, match} -> JS.navigate(~p"/matches/#{match}") end}
      >
        <:col :let={{_id, match}} label="Team a name">{match.team_a_name}</:col>
        <:col :let={{_id, match}} label="Team b name">{match.team_b_name}</:col>
        <:col :let={{_id, match}} label="Sport">{match.sport}</:col>
        <:col :let={{_id, match}} label="Status">{match.status}</:col>
        <:col :let={{_id, match}} label="Winning team">{match.winning_team}</:col>
        <:col :let={{_id, match}} label="Starts at">{match.starts_at}</:col>
        <:col :let={{_id, match}} label="Ends at">{match.ends_at}</:col>
        <:action :let={{_id, match}}>
          <div class="sr-only">
            <.link navigate={~p"/matches/#{match}"}>Show</.link>
          </div>
          <.link navigate={~p"/matches/#{match}/edit"}>Edit</.link>
        </:action>
        <:action :let={{id, match}}>
          <.link
            phx-click={JS.push("delete", value: %{id: match.id}) |> hide("##{id}")}
            data-confirm="Are you sure?"
          >
            Delete
          </.link>
        </:action>
      </.table>
    </Layouts.app>
    """
  end

  @impl true
  def mount(_params, _session, socket) do
    {:ok,
     socket
     |> assign(:page_title, "Listing Matches")
     |> stream(:matches, list_matches())}
  end

  @impl true
  def handle_event("delete", %{"id" => id}, socket) do
    match = Matches.get_match!(id)
    {:ok, _} = Matches.delete_match(match)

    {:noreply, stream_delete(socket, :matches, match)}
  end

  defp list_matches() do
    Matches.list_matches()
  end
end
