defmodule LiveBettingWeb.MatchLive.Show do
  use LiveBettingWeb, :live_view

  alias LiveBetting.Matches

  @impl true
  def render(assigns) do
    ~H"""
    <Layouts.app flash={@flash}>
      <.header>
        Match {@match.id}
        <:subtitle>This is a match record from your database.</:subtitle>
        <:actions>
          <.button navigate={~p"/matches"}>
            <.icon name="hero-arrow-left" />
          </.button>
          <.button variant="primary" navigate={~p"/matches/#{@match}/edit?return_to=show"}>
            <.icon name="hero-pencil-square" /> Edit match
          </.button>
        </:actions>
      </.header>

      <.list>
        <:item title="Team a name">{@match.team_a_name}</:item>
        <:item title="Team b name">{@match.team_b_name}</:item>
        <:item title="Sport">{@match.sport}</:item>
        <:item title="Status">{@match.status}</:item>
        <:item title="Winning team">{@match.winning_team}</:item>
        <:item title="Starts at">{@match.starts_at}</:item>
        <:item title="Ends at">{@match.ends_at}</:item>
      </.list>
    </Layouts.app>
    """
  end

  @impl true
  def mount(%{"id" => id}, _session, socket) do
    {:ok,
     socket
     |> assign(:page_title, "Show Match")
     |> assign(:match, Matches.get_match!(id))}
  end
end
